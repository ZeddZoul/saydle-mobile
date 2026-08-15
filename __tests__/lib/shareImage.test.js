/**
 * The capture boundary. Both halves are native, so the states that matter are
 * "no view-shot", "no expo-sharing", and "capture threw" — in every one of them
 * the reader must still get to share the sentence.
 */
const loadFresh = ({ shot, sharing } = {}) => {
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

  // Spied AFTER resetModules: the reset hands back a fresh react-native, so a
  // spy taken before this line would be on a different Share object entirely.
  const { Share } = require("react-native");
  jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

  return { ...require("../../lib/shareImage.js"), Share };
};

const fakeShot = (over = {}) => ({
  captureRef: jest.fn(async () => "file:///tmp/card.png"),
  ...over,
});

const fakeSharing = (over = {}) => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
  ...over,
});

const ref = { current: {} };

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
  jest.dontMock("react-native-view-shot");
  jest.dontMock("expo-sharing");
});

describe("without the native modules", () => {
  it("reports image sharing as unavailable", () => {
    expect(loadFresh().imageShareAvailable()).toBe(false);
  });

  it("still shares the sentence, which is what the app did before cards existed", async () => {
    const lib = loadFresh();
    const result = await lib.shareCard(ref, { text: "I can rest." });

    expect(lib.Share.share).toHaveBeenCalledWith({ message: "I can rest." });
    expect(result).toMatchObject({ available: false, shared: true });
  });
});

describe("with only half of it", () => {
  it("needs both pieces before it claims to be available", () => {
    expect(loadFresh({ shot: fakeShot() }).imageShareAvailable()).toBe(false);
    expect(loadFresh({ sharing: fakeSharing() }).imageShareAvailable()).toBe(false);
  });
});

describe("fully configured", () => {
  it("captures the card and hands the file to the share sheet", async () => {
    const shot = fakeShot();
    const sharing = fakeSharing();
    const lib = loadFresh({ shot, sharing });

    const result = await lib.shareCard(ref, { text: "I can rest.", dialogTitle: "Share" });

    expect(shot.captureRef).toHaveBeenCalledWith(
      ref,
      expect.objectContaining({ format: "png" }),
    );
    expect(sharing.shareAsync).toHaveBeenCalledWith(
      "file:///tmp/card.png",
      expect.objectContaining({ mimeType: "image/png" }),
    );
    expect(result).toMatchObject({ available: true, shared: true });
  });

  it("renders above 1x so the card is not soft on a retina timeline", async () => {
    const shot = fakeShot();
    const lib = loadFresh({ shot, sharing: fakeSharing() });

    await lib.shareCard(ref, { text: "I can rest." });

    expect(shot.captureRef.mock.calls[0][1].pixelRatio).toBeGreaterThan(1);
  });

  it("falls back to text when the capture fails", async () => {
    const lib = loadFresh({
      shot: fakeShot({
        captureRef: jest.fn(async () => {
          throw new Error("snapshot failed");
        }),
      }),
      sharing: fakeSharing(),
    });

    const result = await lib.shareCard(ref, { text: "I can rest." });

    // Losing the picture must not cost the reader the share entirely.
    expect(lib.Share.share).toHaveBeenCalledWith({ message: "I can rest." });
    expect(result.shared).toBe(false);
  });

  it("uses the OS share sheet when expo-sharing says it cannot", async () => {
    const lib = loadFresh({
      shot: fakeShot(),
      sharing: fakeSharing({ isAvailableAsync: jest.fn(async () => false) }),
    });

    await lib.shareCard(ref, { text: "I can rest." });

    expect(lib.Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///tmp/card.png" }),
    );
  });

  it("shares text when there is no view to photograph", async () => {
    const shot = fakeShot();
    const lib = loadFresh({ shot, sharing: fakeSharing() });

    await lib.shareCard({ current: null }, { text: "I can rest." });

    expect(shot.captureRef).not.toHaveBeenCalled();
    expect(lib.Share.share).toHaveBeenCalledWith({ message: "I can rest." });
  });
});
