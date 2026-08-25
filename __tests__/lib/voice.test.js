/**
 * The audio boundary.
 *
 * Two sources behind one seam: a rendered ElevenLabs clip, and the device's own
 * speech. What matters is that the caller never has to know which it got, and
 * that every path — no module, no clip, a clip that will not play — still ends
 * in `onDone`. A session that only advanced on success would stall forever the
 * first time audio was unavailable, which is precisely when it must not.
 */
const loadFresh = ({ speech, audio } = {}) => {
  jest.resetModules();

  if (speech === undefined) {
    jest.doMock("expo-speech", () => {
      throw new Error("Cannot find native module");
    });
  } else {
    jest.doMock("expo-speech", () => speech);
  }

  if (audio === undefined) {
    jest.doMock("expo-audio", () => {
      throw new Error("Cannot find native module");
    });
  } else {
    jest.doMock("expo-audio", () => audio);
  }

  loaded = require("../../lib/voice.js");
  return loaded;
};

/**
 * The module most recently loaded, so its watchdogs can be cancelled.
 *
 * A player that never finishes leaves a 4s and a 30s timer running, and jest
 * tears the environment down long before those fire — the failure then reads
 * as an unrelated "import after teardown" from whichever test ran last.
 */
let loaded = null;

afterEach(() => {
  loaded?.stopSpeaking();
  loaded = null;
});

const fakeSpeech = () => ({ speak: jest.fn(), stop: jest.fn() });

const fakePlayer = ({ loaded = true } = {}) => {
  const listeners = {};
  return {
    // The real player exposes this, and it is what decides whether play() will
    // actually do anything.
    isLoaded: loaded,
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((event, fn) => {
      listeners[event] = fn;
    }),
    /** Test seam: push a status update through, as the native side would. */
    emit: (status) => listeners.playbackStatusUpdate?.(status),
    /** Test seam: pretend the clip reached its end. */
    finish: () => listeners.playbackStatusUpdate?.({ didJustFinish: true }),
    /** Test seam: the clip finished loading, later than the first attempt. */
    load() {
      this.isLoaded = true;
      listeners.playbackStatusUpdate?.({ isLoaded: true });
    },
  };
};

const fakeAudio = (player) => ({
  createAudioPlayer: jest.fn(() => player),
  setAudioModeAsync: jest.fn(async () => {}),
});

describe("availability", () => {
  it("reports device speech separately from clip playback", () => {
    const both = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(fakePlayer()) });
    expect(both.voiceAvailable()).toBe(true);
    expect(both.clipPlaybackAvailable()).toBe(true);

    const neither = loadFresh();
    expect(neither.voiceAvailable()).toBe(false);
    expect(neither.clipPlaybackAvailable()).toBe(false);
  });
});

describe("playClip", () => {
  it("plays the clip and calls back when it ends", () => {
    const player = fakePlayer();
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(player) });

    const onDone = jest.fn();
    const result = playClip("file:///clip.mp3", { text: "a line", onDone });

    expect(result.source).toBe("clip");
    expect(player.play).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    player.finish();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("only calls back once, however many status updates arrive", () => {
    const player = fakePlayer();
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(player) });

    const onDone = jest.fn();
    playClip("file:///clip.mp3", { text: "a line", onDone });

    player.finish();
    player.finish();

    // Twice would advance the session two lines on one sentence.
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("falls back to device speech when there is no clip", () => {
    const speech = fakeSpeech();
    const { playClip } = loadFresh({ speech, audio: fakeAudio(fakePlayer()) });

    playClip(null, { text: "a line", onDone: jest.fn(), rate: 0.8 });

    // A line the server could not render is still read aloud.
    expect(speech.speak).toHaveBeenCalledWith("a line", expect.objectContaining({ rate: 0.8 }));
  });

  it("falls back when the build has no audio module at all", () => {
    const speech = fakeSpeech();
    const { playClip } = loadFresh({ speech });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });

    expect(speech.speak).toHaveBeenCalled();
  });

  it("falls back when the player throws", () => {
    const speech = fakeSpeech();
    const audio = {
      createAudioPlayer: jest.fn(() => {
        throw new Error("unsupported format");
      }),
    };
    const { playClip } = loadFresh({ speech, audio });

    const result = playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });

    // One sentence in a different voice beats a dead session.
    expect(speech.speak).toHaveBeenCalledWith("a line", expect.anything());
    expect(result.error).toBeInstanceOf(Error);
  });

  it("still calls back with neither source available", async () => {
    const { playClip } = loadFresh();

    const onDone = jest.fn();
    playClip("file:///clip.mp3", { text: "a line", onDone });

    // On a tick, so callers are never re-entered inside their own effect.
    await new Promise((r) => setTimeout(r, 0));
    expect(onDone).toHaveBeenCalled();
  });

  it("releases the previous line before starting the next", () => {
    const first = fakePlayer();
    const second = fakePlayer();
    const audio = { createAudioPlayer: jest.fn() };
    audio.createAudioPlayer.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { playClip } = loadFresh({ speech: fakeSpeech(), audio });

    playClip("file:///one.mp3", { text: "one", onDone: jest.fn() });
    playClip("file:///two.mp3", { text: "two", onDone: jest.fn() });

    // Two clips talking over each other is worse than either alone.
    expect(first.remove).toHaveBeenCalled();
    expect(second.remove).not.toHaveBeenCalled();
  });

  it("does not cut off the current line when a stale one finishes", () => {
    const first = fakePlayer();
    const second = fakePlayer();
    const audio = { createAudioPlayer: jest.fn() };
    audio.createAudioPlayer.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { playClip } = loadFresh({ speech: fakeSpeech(), audio });

    playClip("file:///one.mp3", { text: "one", onDone: jest.fn() });
    playClip("file:///two.mp3", { text: "two", onDone: jest.fn() });

    first.finish();

    // The session already moved on; tearing down here would silence line two.
    expect(second.remove).not.toHaveBeenCalled();
  });
});

describe("the watchdogs", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reads the line with the device when the clip never loads", () => {
    // The exact shape of a build whose native audio module is missing: it
    // hands back a player object that plays nothing and reports nothing. With
    // only `didJustFinish` to go on, the session stops dead on that line and
    // nothing on screen says why. This is that bug, pinned.
    const player = fakePlayer();
    const speech = fakeSpeech();
    const { playClip } = loadFresh({ speech, audio: fakeAudio(player) });

    const onDone = jest.fn();
    playClip("file:///clip.mp3", { text: "a line", onDone });

    expect(speech.speak).not.toHaveBeenCalled();
    jest.advanceTimersByTime(4000);

    expect(speech.speak).toHaveBeenCalledWith("a line", expect.anything());
    expect(player.remove).toHaveBeenCalled();
  });

  it("does not give up on a clip that is actually playing", () => {
    const player = fakePlayer();
    const speech = fakeSpeech();
    const { playClip } = loadFresh({ speech, audio: fakeAudio(player) });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });
    player.emit({ isLoaded: true, playing: true });
    jest.advanceTimersByTime(4000);

    // A slow line is not a broken one.
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it("moves on from a clip that plays but never reports finishing", () => {
    const player = fakePlayer();
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(player) });

    const onDone = jest.fn();
    playClip("file:///clip.mp3", { text: "a line", onDone });
    player.emit({ isLoaded: true, playing: true });

    jest.advanceTimersByTime(30000);

    // Silence forever is worse than one line cut short.
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("cancels the watchdogs once the clip finishes normally", () => {
    const player = fakePlayer();
    const speech = fakeSpeech();
    const { playClip } = loadFresh({ speech, audio: fakeAudio(player) });

    const onDone = jest.fn();
    playClip("file:///clip.mp3", { text: "a line", onDone });
    player.finish();

    jest.advanceTimersByTime(60000);

    // A stale watchdog would speak over the line that came after it.
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it("cancels them when the session moves on early", () => {
    const first = fakePlayer();
    const second = fakePlayer();
    const audio = { createAudioPlayer: jest.fn() };
    audio.createAudioPlayer.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const speech = fakeSpeech();
    const { playClip } = loadFresh({ speech, audio });

    playClip("file:///one.mp3", { text: "one", onDone: jest.fn() });
    playClip("file:///two.mp3", { text: "two", onDone: jest.fn() });
    second.emit({ isLoaded: true, playing: true });

    jest.advanceTimersByTime(60000);

    // The first line's watchdog must not read "one" over the top of line two.
    expect(speech.speak).not.toHaveBeenCalledWith("one", expect.anything());
  });
});

describe("waiting for the clip to be ready", () => {
  it("does not start a player that has not loaded", () => {
    const player = fakePlayer({ loaded: false });
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(player) });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });

    // play() before the item is ready is a no-op: the clip downloads, buffers,
    // and never sounds. That is the bug this whole path exists to avoid, and it
    // is invisible — the watchdog then reads the line with the device instead,
    // so a voice is heard and nothing reports it was the wrong one.
    expect(player.play).not.toHaveBeenCalled();
  });

  it("starts it the moment it reports loaded", () => {
    const player = fakePlayer({ loaded: false });
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(player) });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });
    expect(player.play).not.toHaveBeenCalled();

    player.load();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("starts it only once, however many updates arrive", () => {
    const player = fakePlayer();
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio: fakeAudio(player) });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });
    player.load();
    player.load();

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("tells iOS this app plays audio", () => {
    const audio = fakeAudio(fakePlayer());
    const { playClip } = loadFresh({ speech: fakeSpeech(), audio });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });

    // Without this the session category is silenced by the hardware mute
    // switch — the clip plays and the reader hears nothing. expo-speech is
    // unaffected, which is exactly why the fallback stayed audible while the
    // real voice did not.
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true }),
    );
  });
});

describe("stopSpeaking", () => {
  it("silences both sources", () => {
    const player = fakePlayer();
    const speech = fakeSpeech();
    const { playClip, stopSpeaking } = loadFresh({ speech, audio: fakeAudio(player) });

    playClip("file:///clip.mp3", { text: "a line", onDone: jest.fn() });
    stopSpeaking();

    expect(player.remove).toHaveBeenCalled();
    expect(speech.stop).toHaveBeenCalled();
  });

  it("is safe when nothing is playing", () => {
    const { stopSpeaking } = loadFresh();
    expect(() => stopSpeaking()).not.toThrow();
  });
});
