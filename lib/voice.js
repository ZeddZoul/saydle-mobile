/**
 * The speech boundary.
 *
 * Same guarded lazy-require pattern as lib/purchases.js, lib/notifications.js
 * and lib/widget.js: a top-level import of a missing native module takes down
 * every screen that touches this file, and "not in this binary" is an ordinary
 * state rather than an error.
 *
 * Two sources, one seam.
 *
 * A rendered ElevenLabs clip when the server has one, and the device's own
 * speech when it does not — no key configured, a provider outage, a line whose
 * render failed. Device speech is free, offline and instant, and deliberately
 * not the destination: a satnav voice reading "I am enough" works against the
 * thing Saydle sells. It is the floor, not the product.
 *
 * The seam is `onDone`. A player that advances on "this line finished" does not
 * care whether the sound came from a file or from the device, which is why
 * adding real audio changed this file and nothing above it. A player driven by
 * a timer instead would have to be rewritten, and would drift out of sync with
 * the reading on the first long line.
 *
 * Both native modules are lazily required in a try/catch, the same guarded
 * boundary as purchases, notifications and widgets: absent is an ordinary
 * state, and every function reports rather than throws.
 */
let cached;
let audioLib;

function load() {
  if (cached !== undefined) return cached;

  try {
    cached = require("expo-speech");
  } catch {
    cached = null;
  }

  return cached;
}

function loadAudio() {
  if (audioLib !== undefined) return audioLib;

  try {
    audioLib = require("expo-audio");
  } catch {
    audioLib = null;
  }

  return audioLib;
}

export function voiceAvailable() {
  return Boolean(load());
}

/** True when a rendered clip could be played on this build. */
export function clipPlaybackAvailable() {
  return Boolean(loadAudio()?.createAudioPlayer);
}

/** The player for the line currently being read, so it can be stopped. */
let current = null;

function releaseCurrent() {
  const player = current;
  current = null;

  if (!player) return;

  try {
    player.remove();
  } catch {
    // Already released, or the module went away. Nothing to recover.
  }
}

/**
 * Plays one rendered clip.
 *
 * Falls through to device speech when playback is not possible — a build
 * without expo-audio, or a URL that will not load. `text` is carried for
 * exactly that reason: the caller should never have to decide which source it
 * is getting, and a line that fails to stream must still be read aloud.
 */
export function playClip(url, { text, onDone, ...speech } = {}) {
  const Audio = loadAudio();

  if (!Audio?.createAudioPlayer || !url) {
    return speakLine(text, { onDone, ...speech });
  }

  releaseCurrent();

  try {
    const player = Audio.createAudioPlayer(url);
    current = player;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;

      // Only tear down if this is still the line being read — a session that
      // moved on already released us, and releasing its player would cut off
      // the line now playing.
      if (current === player) releaseCurrent();
      onDone?.();
    };

    player.addListener("playbackStatusUpdate", (status) => {
      if (status?.didJustFinish) finish();
    });

    player.play();
    return { available: true, source: "clip" };
  } catch (error) {
    // A clip that will not play is a line read by the device, not a dead
    // session. The reader hears a different voice for one sentence.
    releaseCurrent();
    return { ...speakLine(text, { onDone, ...speech }), error };
  }
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

/** Silences whichever source is talking. Safe to call when neither is. */
export function stopSpeaking() {
  releaseCurrent();

  const Speech = load();
  if (!Speech) return { available: false };

  try {
    Speech.stop();
    return { available: true };
  } catch (error) {
    return { available: true, error };
  }
}
