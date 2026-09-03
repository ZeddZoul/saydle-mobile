import { Affirmation } from "../models/Affirmation.js";
import { VoiceClip } from "../models/VoiceClip.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { clipFor, clipsForSession, voiceAvailable } from "../services/voice.service.js";
import { isEntitled } from "../services/subscription.service.js";
import { verifyClipSignature, CLIP_URL_TTL_SECONDS } from "../services/clipSignature.js";
import {
  DEFAULT_VOICE,
  VOICE_IDS,
  VOICE_REQUIRES_PREMIUM,
  isVoiceKey,
  resolveVoice,
} from "../config/voices.js";
import { todayInZone, addDays } from "../utils/dates.js";

/**
 * What each voice says when auditioned.
 *
 * Second person, like everything else spoken, and deliberately not one of the
 * real affirmations — a sample that is also somebody's line for today would be
 * spent before they got to it.
 */
const PREVIEW_LINE = "You can be steady about this, without being certain.";

/**
 * The one place the voice's paywall is decided.
 *
 * Same shape as the library's gate, and the same 403, so the app treats both
 * as "show the paywall". Rendering is the single line that scales with
 * engagement — it is not something a free account gets to spend.
 */
function gate(user) {
  if (!VOICE_REQUIRES_PREMIUM) return;
  if (isEntitled(user)) return;

  throw AppError.forbidden("Listening with a Saydle voice is part of Saydle premium.");
}

/**
 * The reader's own local day. Derived from the timezone on the account, not
 * from the request: the app still sends `today`, and it is ignored, because a
 * day the client chooses is a day the client can choose to its own benefit —
 * a voice change "from tomorrow" that lands today, on seven already-paid
 * renders.
 */
const localDay = (user) => todayInZone(user.timezone);

/**
 * The seven lines of a session, each with the clip that reads it.
 *
 * Takes ids rather than text: the client already knows which seven it is
 * listening to, and accepting arbitrary text here would be an open invitation
 * to spend our ElevenLabs credits rendering anything at all.
 */
export async function session(req, res, next) {
  try {
    gate(req.user);

    const ids = req.body.affirmationIds.slice(0, 7);

    // Only lines this reader can actually see: their own, or the shared bank.
    const lines = await Affirmation.find(
      { _id: { $in: ids }, $or: [{ user: req.user._id }, { user: null }] },
      { text: 1, source: 1 },
    ).lean();

    if (lines.length === 0) throw AppError.notFound("Those lines are not yours to play.");

    // Preserve the order asked for — it is the reading order, and a session
    // read out of sequence is a different session.
    const byId = new Map(lines.map((l) => [String(l._id), l]));
    const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);

    const voice = resolveVoice(req.user, localDay(req.user));
    const { clips, throttled } = await clipsForSession(
      // Their own words are theirs alone: keyed on them, served only to them.
      ordered.map((l) => ({ id: l._id, text: l.text, private: l.source === "custom" })),
      VOICE_IDS[voice],
      {
        // Passed so it can be taken back out. The model was told to use it, and
        // a name is the one word a synthetic voice must not get wrong.
        name: req.user.firstName,
        userId: req.user._id,
      },
    );

    res.json({
      voice,
      // False tells the app to read with the device's own speech instead of
      // waiting for audio that is never coming.
      rendered: voiceAvailable(),
      // True when the daily render budget ran out part-way: the lines without
      // a clip are the device's to read today.
      throttled,
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
 * Unauthenticated, because the audio player carries no bearer token. A shared
 * clip is safe that way: the id names a rendering of a line, not a person. A
 * private one — somebody's own words — is served only under the signed URL the
 * session handed out, and cached privately for as long as that URL lasts.
 *
 * Shared clips are cached hard: a clip is immutable by construction — its id
 * is derived from the text and the voice — so it can never go stale.
 */
export async function clip(req, res, next) {
  try {
    const found = await VoiceClip.findById(req.params.id).lean();
    if (!found) throw AppError.notFound("That clip is not here.");

    if (found.user) {
      const { sig, exp } = req.query;
      if (!verifyClipSignature(found._id, sig, exp)) {
        throw AppError.forbidden("This clip is not yours to play.");
      }
      res.setHeader("Cache-Control", `private, max-age=${CLIP_URL_TTL_SECONDS}`);
    } else {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }

    // `.lean()` hands back the raw driver value, which may be a Binary rather
    // than a Buffer depending on how it was written.
    const audio = Buffer.isBuffer(found.audio)
      ? found.audio
      : Buffer.from(found.audio.buffer ?? found.audio);
    const total = audio.length;

    res.setHeader("Content-Type", found.mimeType);
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
    const today = localDay(req.user);
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
    gate(req.user);

    const key = req.body.voice;
    const today = localDay(req.user);
    const active = resolveVoice(req.user, today);

    // Tomorrow in the reader's own day — date arithmetic on their calendar
    // day, not on the server's clock, which may be most of a day away.
    const from = addDays(today, 1);

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
