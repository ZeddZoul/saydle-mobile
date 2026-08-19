import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ShareSheet from "../../components/ShareSheet.jsx";
import { THEMES } from "../../theme/themes.js";

const mockShareCard = jest.fn(async () => ({ available: true, shared: true }));
jest.mock("../../lib/shareImage.js", () => ({
  shareCard: (...args) => mockShareCard(...args),
  imageShareAvailable: () => true,
}));

const mockExportStory = jest.fn(async () => ({ available: true, uri: "file:///tmp/s.mp4" }));
const mockShareVideo = jest.fn(async () => ({ available: true, shared: true }));
const mockVideoAvailable = jest.fn(() => true);

jest.mock("../../lib/videoStory.js", () => ({
  exportStory: (...args) => mockExportStory(...args),
  shareVideo: (...args) => mockShareVideo(...args),
  videoShareAvailable: () => mockVideoAvailable(),
}));

const affirmation = { id: "a1", text: "I get to carry today a little more lightly." };

const lines = [
  affirmation,
  { id: "a2", text: "Rest is not a reward for finishing." },
  { id: "a3", text: "I can begin again on a Tuesday." },
];

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderSheet = (props = {}) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ShareSheet
        visible
        affirmation={affirmation}
        date="2026-08-05"
        onClose={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockShareCard.mockClear();
  mockExportStory.mockClear();
  mockShareVideo.mockClear();
  mockExportStory.mockResolvedValue({ available: true, uri: "file:///tmp/s.mp4" });
  mockVideoAvailable.mockReturnValue(true);
});

describe("ShareSheet", () => {
  it("previews the affirmation exactly as it will be sent", async () => {
    const { findByText } = await renderSheet();
    expect(await findByText(affirmation.text)).toBeTruthy();
  });

  it("renders nothing without an affirmation to share", async () => {
    const { queryByTestId } = await renderSheet({ affirmation: null });
    expect(queryByTestId("share-sheet")).toBeNull();
  });

  it("offers every theme the app ships, not a share-only palette", async () => {
    // What someone posts should be recognisably the product they use.
    const { findByTestId } = await renderSheet();

    for (const theme of THEMES) {
      expect(await findByTestId(`share-theme-${theme.slug}`)).toBeTruthy();
    }
  });

  it("restyles the card without touching the reader's own theme", async () => {
    const { findByTestId } = await renderSheet();

    await fireEvent.press(await findByTestId("share-theme-midnight"));

    // Selection moved; the app's theme is set elsewhere and is not written here.
    expect((await findByTestId("share-theme-midnight")).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it("switches between a square and a story", async () => {
    const { findByText, findByTestId } = await renderSheet();

    const card = await findByTestId("share-card");
    const squareHeight = card.props.style.height;

    await fireEvent.press(await findByText("Story"));

    const tall = (await findByTestId("share-card")).props.style.height;
    expect(tall).toBeGreaterThan(squareHeight);
  });

  it("hands the card off to be captured and shared", async () => {
    const { findByText } = await renderSheet();

    await fireEvent.press(await findByText("Share"));

    await waitFor(() => expect(mockShareCard).toHaveBeenCalled());
    // The plain-text fallback travels with it, for a build with no native capture.
    expect(mockShareCard.mock.calls[0][1].text).toContain(affirmation.text);
  });

  describe("as a video", () => {
    it("is not offered for a single line", async () => {
      // One card held for five seconds is a still with extra steps.
      const { queryByTestId } = await renderSheet();
      expect(queryByTestId("share-format-video")).toBeNull();
    });

    it("is not offered on a build that cannot encode one", async () => {
      mockVideoAvailable.mockReturnValue(false);
      const { queryByTestId } = await renderSheet({ lines });

      // Expo Go: the option is absent rather than failing when tapped.
      expect(queryByTestId("share-format-video")).toBeNull();
    });

    it("is offered once there are lines and a native encoder", async () => {
      const { findByTestId } = await renderSheet({ lines });
      expect(await findByTestId("share-format-video")).toBeTruthy();
    });

    it("mounts the frames only once a video is selected", async () => {
      const { queryByTestId, findByTestId } = await renderSheet({ lines });

      // Live gradients nobody is sending are not worth carrying.
      expect(queryByTestId("story-frames")).toBeNull();

      await fireEvent.press(await findByTestId("share-format-video"));

      expect(await findByTestId("story-frames")).toBeTruthy();
      // One frame per line, or the video is missing sentences.
      for (let i = 0; i < lines.length; i += 1) {
        expect(await findByTestId(`story-frame-${i}`)).toBeTruthy();
      }
    });

    it("previews at the story ratio, because that is what gets encoded", async () => {
      const { findByTestId } = await renderSheet({ lines });

      const square = (await findByTestId("share-card")).props.style.height;
      await fireEvent.press(await findByTestId("share-format-video"));

      // The encoder aspect-fills; a square card would be centre-cropped.
      expect((await findByTestId("share-card")).props.style.height).toBeGreaterThan(square);
    });

    it("encodes and shares the file", async () => {
      const { findByTestId, findByText } = await renderSheet({ lines });

      await fireEvent.press(await findByTestId("share-format-video"));
      await fireEvent.press(await findByText("Share video"));

      await waitFor(() => expect(mockShareVideo).toHaveBeenCalled());
      expect(mockExportStory).toHaveBeenCalledTimes(1);
      expect(mockExportStory.mock.calls[0][0].refs).toHaveLength(lines.length);
      expect(mockShareVideo.mock.calls[0][0]).toBe("file:///tmp/s.mp4");
      expect(mockShareCard).not.toHaveBeenCalled();
    });

    it("falls back to the still card when the encode fails", async () => {
      mockExportStory.mockResolvedValue({ available: true, error: new Error("writerFailed") });

      const { findByTestId, findByText } = await renderSheet({ lines });

      await fireEvent.press(await findByTestId("share-format-video"));
      await fireEvent.press(await findByText("Share video"));

      // Better than an error and an empty-handed exit.
      await waitFor(() => expect(mockShareCard).toHaveBeenCalled());
      expect(mockShareVideo).not.toHaveBeenCalled();
    });
  });

  it("closes when asked", async () => {
    const onClose = jest.fn();
    const { findByTestId } = await renderSheet({ onClose });

    await fireEvent.press(await findByTestId("share-close"));

    expect(onClose).toHaveBeenCalled();
  });
});
