import { Affirmation } from "../models/Affirmation.js";
import { VoiceClip } from "../models/VoiceClip.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { clipFor, clipsForSession, voiceAvailable } from "../services/voice.service.js";
import { DEFAULT_VOICE, VOICE_IDS, isVoiceKey, resolveVoice } from "../config/voices.js";

/**
 * What each voice says when auditioned.
 *
 * Second person, like everything else spoken, and deliberately not one of the
 * real affirmations — a sample that is also somebody's line for today would be
 * spent before they got to it.
 */
const PREVIEW_LINE = "You can be steady about this, without being certain.";

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
 * Range-capable, and that is not an optimisation — it is the difference between
 * the audio playing and not. AVPlayer probes a progressive HTTP source with
 * `Range: bytes=0-1` before it will commit, and a server that answers 200 with
 * the whole body never lets the item reach `readyToPlay`. The clip downloads,
 * buffers, and silently never sounds.
 *
 * Headers go out through `res.setHeader` rather than Express's `res.set`,
 * because the latter runs `mime.charsets.lookup` and appends `charset=utf-8` to
 * anything it does not recognise. A charset on binary audio is meaningless at
 * best and rejected at worst.
 *
 * Cached hard: a clip is immutable by construction — its id is derived from the
 * text and the voice — so it can never go stale.
 */
export async function clip(req, res, next) {
  try {
    const found = await VoiceClip.findById(req.params.id).lean();
    if (!found) throw AppError.notFound("That clip is not here.");

    // `.lean()` hands back the raw driver value, which may be a Binary rather
    // than a Buffer depending on how it was written.
    const audio = Buffer.isBuffer(found.audio)
      ? found.audio
      : Buffer.from(found.audio.buffer ?? found.audio);
    const total = audio.length;

    res.setHeader("Content-Type", found.mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // Advertised even on a full response: without it the player may not bother
    // asking for a range at all, and some clients then refuse to seek.
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;
    if (!range) {
      res.setHeader("Content-Length", String(total));
      return res.status(200).end(audio);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2])) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }

    let start;
    let end;

    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    } else {
      // A suffix range — "the last N bytes" — which is how some players read
      // an mp3's trailing metadata.
      start = Math.max(0, total - Number(match[2]));
      end = total - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }

    const chunk = audio.subarray(start, end + 1);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(chunk.length));
    return res.status(206).end(chunk);
  } catch (err) {
    next(err);
  }
}

/**
 * One voice reading a fixed sample, so the picker can be auditioned.
 *
 * The whole reason to offer five is that the difference between them is audible
 * and not describable — a picker that previews all five with the device's own
 * speech makes people choose blind, which is worse than offering one voice.
 *
 * The sample is the same sentence for everyone, so after the first reader
 * auditions a voice it is rendered once and never again, for anybody. Five
 * clips in total, permanently, across the entire user base.
 */
export async function preview(req, res, next) {
  try {
    const key = String(req.params.key ?? "");
    if (!isVoiceKey(key)) throw AppError.notFound("No such voice.");

    const clipDoc = await clipFor(PREVIEW_LINE, VOICE_IDS[key]);
    if (!clipDoc) return res.json({ voice: key, clipId: null, available: voiceAvailable() });

    res.json({ voice: key, clipId: String(clipDoc._id), available: true });
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
