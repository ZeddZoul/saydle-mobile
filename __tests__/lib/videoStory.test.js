/**
 * The video path crosses three native boundaries — view-shot, the export
 * module, expo-sharing — and any of them can be missing from a build. What
 * matters is that a missing one degrades instead of throwing, and that the
 * frames handed to the encoder are in reading order.
 */
const loadFresh = ({ shot, native, sharing } = {}) => {
  jest.resetModules();

  if (shot === undefined) {
    jest.doMock("react-native-view-shot", () => {
      throw new Error("Cannot find native module");
    });
  } else {
    jest.doMock("react-native-view-shot", () => shot);
  }

  if (sharing === undefined) {
    jest.doMock("expo-sharing", () => {
      throw new Error("Cannot find native module");
    });
  } else {
    jest.doMock("expo-sharing", () => sharing);
  }

  jest.doMock("expo-modules-core", () => ({
    requireNativeModule: () => {
      if (!native) throw new Error("Cannot find native module");
      return native;
    },
  }));

  const { Share } = require("react-native");
  jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

  return { ...require("../../lib/videoStory.js"), Share };
};

const fakeShot = (over = {}) => {
  let n = 0;
  return {
    captureRef: jest.fn(async () => `file:///tmp/frame-${(n += 1)}.png`),
    ...over,
  };
};

const fakeNative = (over = {}) => ({
  export: jest.fn(async () => "/tmp/story.mp4"),
  ...over,
});

const fakeSharing = (over = {}) => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
  ...over,
});

const refs = (n) => Array.from({ length: n }, (_, i) => ({ current: { id: i } }));

describe("videoShareAvailable", () => {
  it("is true only when capture and encoding are both present", () => {
    expect(loadFresh({ shot: fakeShot(), native: fakeNative() }).videoShareAvailable()).toBe(
      true,
    );
  });

  it("is false without view-shot", () => {
    expect(loadFresh({ native: fakeNative() }).videoShareAvailable()).toBe(false);
  });

  it("is false without the export module — Expo Go", () => {
    expect(loadFresh({ shot: fakeShot() }).videoShareAvailable()).toBe(false);
  });
});

describe("captureFrames", () => {
  it("captures every card, in order", async () => {
    const shot = fakeShot();
    const { captureFrames } = loadFresh({ shot, native: fakeNative() });

    const { available, frames } = await captureFrames(refs(3));

    expect(available).toBe(true);
    // Order is the reading order, and becomes the frame order.
    expect(frames).toEqual([
      "file:///tmp/frame-1.png",
      "file:///tmp/frame-2.png",
      "file:///tmp/frame-3.png",
    ]);
    expect(shot.captureRef).toHaveBeenCalledTimes(3);
  });

  it("skips refs that never mounted", async () => {
    const shot = fakeShot();
    const { captureFrames } = loadFresh({ shot, native: fakeNative() });

    const { frames } = await captureFrames([{ current: {} }, { current: null }, null]);

    // A detached ref would make captureRef throw and lose the whole video.
    expect(frames).toHaveLength(1);
    expect(shot.captureRef).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable rather than throwing without view-shot", async () => {
    const { captureFrames } = loadFresh({ native: fakeNative() });
    await expect(captureFrames(refs(2))).resolves.toEqual({ available: false, frames: [] });
  });
});

describe("exportStory", () => {
  it("hands the captured frames to the encoder", async () => {
    const native = fakeNative();
    const { exportStory } = loadFresh({ shot: fakeShot(), native });

    const result = await exportStory({ refs: refs(2), secondsPerLine: 5 });

    expect(result.uri).toBe("file:///tmp/story.mp4");

    const [images, audio, seconds, width] = native.export.mock.calls[0];
    // Paths cross the bridge bare — the native side opens files, not URLs.
    expect(images).toEqual(["/tmp/frame-1.png", "/tmp/frame-2.png"]);
    expect(audio).toBeNull();
    expect(seconds).toBe(5);
    expect(width).toBe(1080);
  });

  it("passes a voice track through when there is one", async () => {
    const native = fakeNative();
    const { exportStory } = loadFresh({ shot: fakeShot(), native });

    await exportStory({ refs: refs(1), audio: "file:///tmp/voice.m4a" });

    expect(native.export.mock.calls[0][1]).toBe("/tmp/voice.m4a");
  });

  it("errors rather than encoding nothing", async () => {
    const native = fakeNative();
    const { exportStory } = loadFresh({ shot: fakeShot(), native });

    const result = await exportStory({ refs: [] });

    expect(result.error).toBeInstanceOf(Error);
    expect(native.export).not.toHaveBeenCalled();
  });

  it("reports unavailable when nothing can be captured", async () => {
    const { exportStory } = loadFresh({ native: fakeNative() });
    await expect(exportStory({ refs: refs(2) })).resolves.toEqual({ available: false });
  });

  it("returns the encoder's failure instead of throwing", async () => {
    const native = fakeNative({
      export: jest.fn(async () => {
        throw new Error("writerFailed");
      }),
    });
    const { exportStory } = loadFresh({ shot: fakeShot(), native });

    const result = await exportStory({ refs: refs(2) });

    expect(result.available).toBe(true);
    expect(result.error.message).toBe("writerFailed");
    expect(result.uri).toBeUndefined();
  });
});

describe("shareVideo", () => {
  it("sends the file when sharing is available", async () => {
    const sharing = fakeSharing();
    const { shareVideo } = loadFresh({ shot: fakeShot(), native: fakeNative(), sharing });

    const result = await shareVideo("file:///tmp/story.mp4", { text: "a line" });

    expect(result.shared).toBe(true);
    expect(sharing.shareAsync).toHaveBeenCalledWith(
      "file:///tmp/story.mp4",
      expect.objectContaining({ mimeType: "video/mp4" }),
    );
  });

  it("falls back to sharing the sentence without expo-sharing", async () => {
    const { shareVideo, Share } = loadFresh({ shot: fakeShot(), native: fakeNative() });

    const result = await shareVideo("file:///tmp/story.mp4", { text: "a line" });

    // Losing the artefact must not lose the act of sharing.
    expect(result.fallback).toBe(true);
    expect(Share.share).toHaveBeenCalledWith({ message: "a line" });
  });

  it("falls back when sharing is present but unusable", async () => {
    const sharing = fakeSharing({ isAvailableAsync: jest.fn(async () => false) });
    const { shareVideo, Share } = loadFresh({
      shot: fakeShot(),
      native: fakeNative(),
      sharing,
    });

    await shareVideo("file:///tmp/story.mp4", { text: "a line" });

    expect(Share.share).toHaveBeenCalledWith({
      message: "a line",
      url: "file:///tmp/story.mp4",
    });
  });

  it("still offers the sentence when the share sheet throws", async () => {
    const sharing = fakeSharing({
      shareAsync: jest.fn(async () => {
        throw new Error("user cancelled");
      }),
    });
    const { shareVideo, Share } = loadFresh({
      shot: fakeShot(),
      native: fakeNative(),
      sharing,
    });

    const result = await shareVideo("file:///tmp/story.mp4", { text: "a line" });

    expect(result.shared).toBe(false);
    expect(Share.share).toHaveBeenCalled();
  });
});
