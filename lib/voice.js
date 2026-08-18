/**
 * The speech boundary.
 *
 * Same guarded lazy-require pattern as lib/purchases.js, lib/notifications.js
 * and lib/widget.js: a top-level import of a missing native module takes down
 * every screen that touches this file, and "not in this binary" is an ordinary
 * state rather than an error.
 *
 * Device TTS today. It is free, offline and instant, and it is deliberately not
 * the destination — a satnav voice reading "I am enough" works against the
 * thing Saydle sells. The five archetype voices come from ElevenLabs, rendered
 * ahead of time and cached per (text, voiceId).
 *
 * The seam is `onDone`. A player that advances on "this line finished" does not
 * care whether the sound came from the device or from a file, so swapping the
 * source later is this file changing and nothing else. A player driven by a
 * timer instead would have to be rewritten, and would drift out of sync with
 * the reading on the first long line.
 */
let cached;

function load() {
  if (cached !== undefined) return cached;

  try {
    cached = require("expo-speech");
  } catch {
    cached = null;
  }

  return cached;
}

export function voiceAvailable() {
  return Boolean(load());
}

/**
 * Reads one line aloud.
 *
 * `onDone` fires whether the speech finished, was stopped, or never started —
 * a session that only advanced on success would stall forever the first time
 * TTS was unavailable, which is precisely the case where it must not.
 */
export function speakLine(text, { onDone, rate = 0.82, pitch = 1.0 } = {}) {
  const Speech = load();

  if (!Speech || !text) {
    // Still hand control back, on a tick rather than synchronously so callers
    // are never re-entered inside their own effect.
    setTimeout(() => onDone?.(), 0);
    return { available: false };
  }

  try {
    Speech.speak(text, {
      rate,
      pitch,
      onDone: () => onDone?.(),
      onStopped: () => onDone?.(),
      onError: () => onDone?.(),
    });
    return { available: true };
  } catch (error) {
    setTimeout(() => onDone?.(), 0);
    return { available: false, error };
  }
}

export function stopSpeaking() {
  const Speech = load();
  if (!Speech) return { available: false };

  try {
    Speech.stop();
    return { available: true };
  } catch (error) {
    return { available: true, error };
  }
}
