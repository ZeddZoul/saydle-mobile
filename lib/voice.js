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
/**
 * How long a clip gets to show any sign of life before the device reads the
 * line instead. Generous enough for a cold fetch on a slow connection, short
 * enough that a dead player is not mistaken for a thoughtful pause.
 */
const STALL_MS = 4000;

/**
 * How often to check whether the clip is ready to start.
 *
 * A poll rather than an event, because the events are circular: expo-audio
 * emits `playbackStatusUpdate` on an interval *while playing*, so waiting for
 * one to tell us the clip is loaded never arrives when the thing we are waiting
 * to start is playback. `isLoaded` is also a property on the player, and
 * reading it directly is what breaks the loop.
 */
const READY_POLL_MS = 100;

/**
 * A ceiling on one line. Affirmations are one sentence; anything still going
 * after this is a player that started and will never report finishing.
 */
const MAX_CLIP_MS = 30000;

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

/**
 * Tell iOS this app plays audio, once.
 *
 * Without it the session category is whatever the OS defaults to, which is
 * silenced by the hardware mute switch — so a clip renders, downloads, plays,
 * and the reader hears nothing at all. `expo-speech` is not affected, which is
 * exactly why the fallback stayed audible while the real voice did not.
 *
 * Recording flips this deliberately (see useVoiceNote); this only sets the
 * floor for playback.
 */
let audioModeSet = false;

function ensureAudioMode(Audio) {
  if (audioModeSet || !Audio?.setAudioModeAsync) return;
  audioModeSet = true;

  Audio.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
    // Not fatal: on a device with the switch off it plays regardless.
    audioModeSet = false;
  });
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
/** Cancels that player's watchdogs. A timer must not outlive its player. */
let currentTimers = null;

function releaseCurrent() {
  const player = current;
  const cancel = currentTimers;
  current = null;
  currentTimers = null;

  cancel?.();

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
  ensureAudioMode(Audio);

  try {
    const player = Audio.createAudioPlayer(url);
    current = player;

    let settled = false;
    const timers = [];
    // setInterval and setTimeout ids are interchangeable to both clear
    // functions in React Native, but clearing each as both is unambiguous.
    const clearTimers = () =>
      timers.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
    currentTimers = clearTimers;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimers();

      // Only tear down if this is still the line being read — a session that
      // moved on already released us, and releasing its player would cut off
      // the line now playing.
      if (current === player) releaseCurrent();
      fn();
    };

    const finish = () => settle(() => onDone?.());

    // A clip that never loads reads the line with the device instead. Without
    // this the session simply stops: `didJustFinish` is the only thing that
    // advances it, so a player that never plays hangs it forever with nothing
    // on screen to say why. That is exactly what a build missing the native
    // audio module does — it hands back a player object that does nothing.
    const giveUp = () => settle(() => speakLine(text, { onDone, ...speech }));

    let alive = false;
    let started = false;

    /**
     * Start it the moment it is ready, and not before.
     *
     * `play()` on a player that has not finished loading is a no-op — the clip
     * downloads, buffers, and simply never sounds. That failure is invisible:
     * the watchdog below then reads the line with the device, so the reader
     * hears a voice and nothing anywhere reports that it was the wrong one.
     */
    const startWhenReady = () => {
      if (started || settled || !player.isLoaded) return;

      started = true;
      // Deliberately not `alive`. Having called play() is not evidence that
      // anything is coming out — that only arrives as a status update saying
      // so, and treating the call itself as proof would defuse the watchdog
      // below into a thirty-second silence.
      player.play();
    };

    player.addListener("playbackStatusUpdate", (status) => {
      if (status?.isLoaded) startWhenReady();
      if (status?.playing) alive = true;
      if (status?.didJustFinish) finish();
    });

    // The poll is what actually starts it; the listener above is the fast path
    // for when updates do arrive.
    const ready = setInterval(startWhenReady, READY_POLL_MS);
    timers.push(ready);

    // Nothing has loaded or started: assume it never will.
    timers.push(setTimeout(() => !alive && giveUp(), STALL_MS));
    // Playing, but no end ever reported. Move on rather than sit in silence.
    timers.push(setTimeout(finish, MAX_CLIP_MS));

    startWhenReady();
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
