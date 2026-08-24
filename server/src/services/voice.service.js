import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { VoiceClip, clipKey } from "../models/VoiceClip.js";

/**
 * Rendering a line in one of the five voices.
 *
 * Same guarded shape as vertex.service.js: no key is an ordinary state, not an
 * error. Without one the app falls back to the device's own speech, which is
 * how Practice worked before this existed — so a missing key costs the quality
 * of the voice and nothing else.
 *
 * The key lives here and only here. It can never be an EXPO_PUBLIC_* var: those
 * are inlined into the bundle at build time, so anyone could pull it out of a
 * shipped app and spend the credits.
 */

const API = "https://api.elevenlabs.io/v1/text-to-speech";

/**
 * Flash is roughly half the credits of the multilingual model per character.
 * Voice is the dominant cost here, so that halving is worth more than any other
 * optimisation in the codebase — and on seven short declarative sentences the
 * quality difference is far smaller than it is across a paragraph of prose.
 */
const MODEL = "eleven_flash_v2_5";

export function voiceAvailable() {
  return Boolean(env.ELEVENLABS_API_KEY);
}

/**
 * Calls ElevenLabs. Returns the audio, or throws.
 *
 * Deliberately the only function that knows the provider exists — everything
 * above it deals in "give me this line in this voice".
 */
async function render(text, voiceId, { signal } = {}) {
  const response = await fetch(`${API}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: {
        // Higher stability than the default. An affirmation read with dramatic
        // variation sounds performed; the same sentence needs to land the same
        // way every morning.
        stability: 0.6,
        similarity_boost: 0.75,
        // No style exaggeration. The archetype is the voice, not the acting.
        style: 0,
        use_speaker_boost: true,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 200)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * A line in a voice, rendered once and remembered.
 *
 * Reads the cache first, and on a hit does no network work at all — which is
 * the entire cost strategy. On a miss it renders, stores, and returns.
 *
 * Concurrent callers asking for the same clip both render: the upsert makes
 * that harmless rather than a duplicate row, and the alternative — a lock — is
 * a lot of machinery to save one duplicate render of a five-word sentence.
 */
export async function clipFor(text, voiceId, options = {}) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed || !voiceId) return null;

  const key = clipKey(trimmed, voiceId);

  const cached = await VoiceClip.findOneAndUpdate(
    { key },
    { $set: { lastUsedAt: new Date() } },
    { new: true },
  );
  if (cached) return cached;

  if (!voiceAvailable()) return null;

  let audio;
  try {
    audio = await render(trimmed, voiceId, options);
  } catch (err) {
    // A failed render is the device voice for that line, not a failed session.
    logger.error({ err, voiceId }, "voice render failed");
    return null;
  }

  const doc = {
    key,
    voiceId,
    text: trimmed,
    audio,
    bytes: audio.length,
    characters: trimmed.length,
    lastUsedAt: new Date(),
  };

  // Upsert rather than create: two requests for the same new clip race, and
  // losing that race should return the winner's clip, not throw a duplicate key.
  return VoiceClip.findOneAndUpdate(
    { key },
    { $setOnInsert: doc },
    { new: true, upsert: true },
  );
}

/**
 * Renders a whole session.
 *
 * Sequential on purpose. Seven parallel requests is a burst against a
 * per-minute quota for no wall-clock benefit worth having — the reader is not
 * waiting on line seven while line one plays. It also means a rate-limit hit
 * costs one line rather than all of them.
 */
export async function clipsForSession(lines, voiceId) {
  const clips = [];

  for (const line of lines) {
    const clip = await clipFor(line.text, voiceId);
    clips.push({
      id: String(line.id ?? line._id ?? ""),
      text: line.text,
      // Null means "read this one with the device voice" — a partial session is
      // better than none, and the seam already handles a mixed source.
      clipId: clip ? String(clip._id) : null,
    });
  }

  return clips;
}
