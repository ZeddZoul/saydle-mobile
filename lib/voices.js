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
 * on 2026-08-24 — all
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
    // Sam - Support Agent
    elevenLabsId: "scOwDtmlUjD3prqpp97I",
  },
  {
    key: "mentor",
    /** Warm but with some edge — encouragement rather than comfort. */
    speech: { pitch: 0.9, rate: 0.86 },
    // Ellen - Serious, Direct and Confident
    elevenLabsId: "BIvP0GN1cAtSRTxNHnWS",
  },
  {
    key: "peer",
    /** Deliberately between registers: someone alongside you, not above. */
    speech: { pitch: 1.0, rate: 0.9 },
    // Mark - Casual, Relaxed and Light
    elevenLabsId: "1SM7GgM6IMuvQlz2BwM3",
  },
  {
    key: "mother",
    /** Softer and slower, with the warmth carried in the pace. */
    speech: { pitch: 1.12, rate: 0.78 },
    // Blondie - Conversational
    elevenLabsId: "exsUS4vynmxd379XN4yO",
  },
  {
    key: "grandfather",
    /** Slowest of the five. Unhurried in the way of someone who has time. */
    speech: { pitch: 1.05, rate: 0.68 },
    // Spuds Oxley - Wise and Approachable
    elevenLabsId: "NOpBlnGInO9m6vDvFkFC",
  },
];

export const DEFAULT_VOICE = "mother";

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
