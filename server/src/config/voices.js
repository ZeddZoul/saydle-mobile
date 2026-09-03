/**
 * The five voices, as the server knows them.
 *
 * Deliberately a mirror of lib/voices.js on the client rather than something
 * shared: the client needs pitch and rate for its device-speech fallback, the
 * server needs ElevenLabs ids and nothing else, and a shared module would ship
 * both halves to both places for no benefit.
 *
 * The KEY is the contract between them. Ids live only here, so a voice can be
 * swapped without shipping an app update, and a phone that has never heard of a
 * key still gets audio because the server resolves it.
 */
export const VOICE_IDS = {
  father: "LruHrtVF6PSyGItzMNHS", // Benjamin - Deep, Warm, Calming
  mentor: "KHCvMklQZZo0O30ERnVn", // Sara Martin - Gentle and Layered
  peer: "BpjGufoPiobT79j2vtj4", // Priyanka - Calm, Neutral and Relaxed
  mother: "DODLEQrClDo8wCz460ld", // Lauren - Friendly, Comforting and Soft
  grandfather: "NOpBlnGInO9m6vDvFkFC", // Grandpa Spuds Oxley
};

export const DEFAULT_VOICE = "mother";

/**
 * Premium from day one.
 *
 * Stated here rather than in the controller for the same reason the library's
 * flag lives in config/library.js: rendering is the one cost that scales with
 * how much someone listens, and the decision to charge for it should be one
 * edit in a file named after the thing, not a hunt through route handlers.
 */
export const VOICE_REQUIRES_PREMIUM = true;

/** A voice suggested by the tone they chose at onboarding. Never an assignment. */
const BY_TONE = { gentle: "mother", grounded: "father", energetic: "peer" };

export const isVoiceKey = (key) => Object.hasOwn(VOICE_IDS, key);

/**
 * Which voice reads for this user today.
 *
 * A pending choice becomes the active one once its day arrives, resolved on
 * read. `today` is passed in rather than taken from the clock here, because the
 * day that matters is the reader's local one and only the request knows it.
 */
export function resolveVoice(user, today) {
  const pref = user?.preferences?.voice ?? {};

  if (pref.pending && pref.pendingFrom && pref.pendingFrom <= today) {
    return isVoiceKey(pref.pending) ? pref.pending : DEFAULT_VOICE;
  }

  if (pref.active && isVoiceKey(pref.active)) return pref.active;

  return BY_TONE[user?.preferences?.tone] ?? DEFAULT_VOICE;
}

/** The id to render with, or null if the key is one we no longer ship. */
export function voiceIdFor(user, today) {
  return VOICE_IDS[resolveVoice(user, today)] ?? null;
}
