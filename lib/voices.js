/**
 * The five voices a listening session can be read in.
 *
 * Family roles, deliberately — a fatherly voice and a grandmotherly one are
 * different kinds of comfort, and which one helps is not something an app can
 * infer. So the reader chooses, and nothing here guesses.
 *
 * `speech` are placeholder parameters driving the device's own TTS, so the
 * archetypes can be heard and the pacing judged before a penny goes to
 * ElevenLabs. They are a sketch, not the product — pitch and rate cannot make a
 * satnav sound like anyone's grandmother, and the point of the real voices is
 * that they do.
 *
 * `elevenLabsId` is the slot the real voice drops into. When it is filled, the
 * only file that changes is lib/voice.js: everything else — the picker, the
 * preference, the session — is already talking about a voice by its key.
 */
export const VOICES = [
  {
    key: "father",
    /** Steady, unhurried, low. The one that sounds certain on your behalf. */
    speech: { pitch: 0.72, rate: 0.76 },
    elevenLabsId: null,
  },
  {
    key: "mentor",
    /** Warm but with some edge — encouragement rather than comfort. */
    speech: { pitch: 0.9, rate: 0.86 },
    elevenLabsId: null,
  },
  {
    key: "peer",
    /** Deliberately between registers: someone alongside you, not above. */
    speech: { pitch: 1.0, rate: 0.9 },
    elevenLabsId: null,
  },
  {
    key: "mother",
    /** Softer and slower, with the warmth carried in the pace. */
    speech: { pitch: 1.12, rate: 0.78 },
    elevenLabsId: null,
  },
  {
    key: "grandmother",
    /** Slowest of the five. Unhurried in the way of someone who has time. */
    speech: { pitch: 1.05, rate: 0.68 },
    elevenLabsId: null,
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
