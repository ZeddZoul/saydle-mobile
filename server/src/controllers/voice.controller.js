import { Affirmation } from "../models/Affirmation.js";
import { VoiceClip } from "../models/VoiceClip.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { clipsForSession, voiceAvailable } from "../services/voice.service.js";
import { DEFAULT_VOICE, VOICE_IDS, isVoiceKey, resolveVoice } from "../config/voices.js";

/** The reader's own local day, sent by the app. Their midnight, not the server's. */
function localDay(req) {
  const today = String(req.query.today ?? req.body?.today ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);
}

/**
 * The seven lines of a session, each with the clip that reads it.
 *
 * Takes ids rather than text: the client already knows which seven it is
 * listening to, and accepting arbitrary text here would be an open invitation
 * to spend our ElevenLabs credits rendering anything at all.
 */
export async function session(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.affirmationIds)
      ? req.body.affirmationIds.slice(0, 7)
      : [];
    if (ids.length === 0) throw AppError.badRequest("No affirmations to read.");

    // Only lines this reader can actually see: their own, or the shared bank.
    const lines = await Affirmation.find(
      { _id: { $in: ids }, $or: [{ user: req.user._id }, { user: null }] },
      { text: 1 },
    ).lean();

    if (lines.length === 0) throw AppError.notFound("Those lines are not yours to play.");

    // Preserve the order asked for — it is the reading order, and a session
    // read out of sequence is a different session.
    const byId = new Map(lines.map((l) => [String(l._id), l]));
    const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);

    const voice = resolveVoice(req.user, localDay(req));
    const clips = await clipsForSession(
      ordered.map((l) => ({ id: l._id, text: l.text })),
      VOICE_IDS[voice],
      // Passed so it can be taken back out. The model was told to use it, and
      // a name is the one word a synthetic voice must not get wrong.
      { name: req.user.firstName },
    );

    res.json({
      voice,
      // False tells the app to read with the device's own speech instead of
      // waiting for audio that is never coming.
      rendered: voiceAvailable(),
      lines: clips,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Streams one rendered line.
 *
 * Cached hard at the edge: a clip is immutable by construction — its id is
 * derived from the text and the voice — so it can never go stale.
 */
export async function clip(req, res, next) {
  try {
    const found = await VoiceClip.findById(req.params.id).lean();
    if (!found) throw AppError.notFound("That clip is not here.");

    res.set("Content-Type", found.mimeType);
    res.set("Content-Length", String(found.bytes));
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(found.audio);
  } catch (err) {
    next(err);
  }
}

/** Which voice reads today, and which is waiting to. */
export async function getVoice(req, res, next) {
  try {
    const today = localDay(req);
    const pref = req.user.preferences?.voice ?? {};
    const active = resolveVoice(req.user, today);

    const landed = pref.pendingFrom && pref.pendingFrom <= today;
    res.json({
      active,
      pending: !landed && pref.pending && pref.pending !== active ? pref.pending : null,
      pendingFrom: landed ? null : pref.pendingFrom || null,
      available: voiceAvailable(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Choose a voice. It reads from tomorrow.
 *
 * The deferral is enforced here rather than trusted from the client, because
 * this is what decides whether we pay to render today's seven lines twice.
 */
export async function setVoice(req, res, next) {
  try {
    const key = String(req.body?.voice ?? "");
    if (!isVoiceKey(key)) throw AppError.badRequest("That is not one of the voices.");

    const today = localDay(req);
    const active = resolveVoice(req.user, today);

    // Tomorrow in the reader's own day — string arithmetic on their date, not
    // on the server's clock, which may be most of a day away from theirs.
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const from = tomorrow.toISOString().slice(0, 10);

    const voice = { active, pending: key, pendingFrom: from };
    await User.updateOne({ _id: req.user._id }, { $set: { "preferences.voice": voice } });

    res.json({
      active,
      pending: key === active ? null : key,
      pendingFrom: key === active ? null : from,
    });
  } catch (err) {
    next(err);
  }
}

export const defaults = { DEFAULT_VOICE };
