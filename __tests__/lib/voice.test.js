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

  return require("../../lib/voice.js");
};

const fakeSpeech = () => ({ speak: jest.fn(), stop: jest.fn() });

const fakePlayer = () => {
  const listeners = {};
  return {
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((event, fn) => {
      listeners[event] = fn;
    }),
    /** Test seam: pretend the clip reached its end. */
    finish: () => listeners.playbackStatusUpdate?.({ didJustFinish: true }),
  };
};

const fakeAudio = (player) => ({ createAudioPlayer: jest.fn(() => player) });

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
