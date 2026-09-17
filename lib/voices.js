import { API_URL } from "./config.js";

/**
 * The five voices a listening session can be read in.
 *
 * Family roles, deliberately — a fatherly voice and a grandfatherly one are
 * different kinds of comfort, and which one helps is not something an app can
 * infer. So the reader chooses, and nothing here guesses.
 *
 * `speech` are placeholder parameters driving the device's own TTS, so the
 * archetypes can be heard and the pacing judged before a penny goes to
 * ElevenLabs. They are a sketch, not the product — pitch and rate cannot make a
 * satnav sound like anyone's grandfather, and the point of the real voices is
 * that they do.
 *
 * `elevenLabsId` names the ElevenLabs voice each archetype is read in, chosen
 * on 2026-08-24 from the library's calm/gentle/meditative shelf — all
 * free-tier, none carrying the $0.20/1,000-credit surcharge, none with Live
 * Moderation enabled. The surcharge is the one that matters: at seven lines a
 * day it works out around $2.34 per subscriber per month, against $3.54 net on
 * the annual plan. A surcharged voice does not dent the margin, it removes it.
 *
 * Live Moderation is avoided for a subtler reason: it screens the text being
 * submitted, and "My words" lets people write their own affirmations. Someone
 * working through grief or recovery in their own words is exactly who this is
 * for, and exactly the text a prohibited-category filter is most likely to
 * refuse. A voice that can decline to read a user's own words back to them is
 * not a voice this product can use.
 *
 * Filling the ids is not the whole job. The ElevenLabs key can never reach the
 * app — EXPO_PUBLIC_* is inlined at build time — so rendering happens on the
 * server and the app plays files it is handed. See ELEVENLABS_API_KEY in
 * server/.env.example.
 */
export const VOICES = [
  {
    key: "father",
    /** Steady, unhurried, low. The one that sounds certain on your behalf. */
    speech: { pitch: 0.72, rate: 0.76 },
    // Benjamin - Deep, Warm, Calming
    elevenLabsId: "LruHrtVF6PSyGItzMNHS",
  },
  {
    key: "mentor",
    /** Warm but with some edge — encouragement rather than comfort. */
    speech: { pitch: 0.9, rate: 0.86 },
    // Sara Martin - Gentle and Layered
    elevenLabsId: "KHCvMklQZZo0O30ERnVn",
  },
  {
    key: "peer",
    /** Deliberately between registers: someone alongside you, not above. */
    speech: { pitch: 1.0, rate: 0.9 },
    // Priyanka - Calm, Neutral and Relaxed
    elevenLabsId: "BpjGufoPiobT79j2vtj4",
  },
  {
    key: "mother",
    /** Softer and slower, with the warmth carried in the pace. */
    speech: { pitch: 1.12, rate: 0.78 },
    // Lauren - Friendly, Comforting and Soft
    elevenLabsId: "DODLEQrClDo8wCz460ld",
  },
  {
    key: "grandfather",
    /** Slowest of the five. Unhurried in the way of someone who has time. */
    speech: { pitch: 1.05, rate: 0.68 },
    // Grandpa Spuds Oxley
    elevenLabsId: "NOpBlnGInO9m6vDvFkFC",
  },
];

export const DEFAULT_VOICE = "mother";

/**
 * Where a rendered clip lives.
 *
 * Absolute, because the audio player fetches it directly rather than through
 * `lib/api.js` — which also means it carries no auth header. That is fine and
 * deliberate: a clip belongs to a line and a voice, not to a person, and two
 * readers given the same curated line are served the same clip by design.
 */
export const clipUrl = (clipId) => (clipId ? `${API_URL}/api/voice/clip/${clipId}` : null);

/**
 * The URL a session line's clip plays from.
 *
 * The server now names the clip itself: a shared clip as a bare path, and a
 * clip of the reader's own words as a path carrying a signature and an expiry,
 * because those are served only to their owner and the audio player cannot
 * send a bearer header. Prefer that path whenever it is present — building the
 * URL from the id here would drop the signature and the clip would 403, which
 * `playClip` hides behind device speech. The id fallback keeps an older server
 * working.
 */
export const lineClipUrl = (line) => {
  const path = line?.clipUrl;
  if (typeof path === "string" && path.length > 0) {
    return /^https?:\/\//.test(path) ? path : `${API_URL}${path}`;
  }
  return clipUrl(line?.clipId);
};

export const voiceByKey = (key) => VOICES.find((v) => v.key === key) ?? VOICES[0];

/**
 * The tone someone chose at onboarding, as a starting voice.
 *
 * A suggestion, never an assignment. It is drawn from something they told us
 * directly rather than inferred from anything, and they hear it immediately and
 * can change it — which is the difference between a helpful default and the app
 * deciding something about them behind their back.
 */
export function suggestedVoice(tone) {
  return { gentle: "mother", grounded: "father", energetic: "peer" }[tone] ?? DEFAULT_VOICE;
}
