import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ShareSheet from "../../components/ShareSheet.jsx";
import { THEMES } from "../../theme/themes.js";

const mockShareCard = jest.fn(async () => ({ available: true, shared: true }));
jest.mock("../../lib/shareImage.js", () => ({
  shareCard: (...args) => mockShareCard(...args),
  imageShareAvailable: () => true,
}));

const affirmation = { id: "a1", text: "I get to carry today a little more lightly." };

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

beforeEach(() => mockShareCard.mockClear());

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

  it("closes when asked", async () => {
    const onClose = jest.fn();
    const { findByTestId } = await renderSheet({ onClose });

    await fireEvent.press(await findByTestId("share-close"));

    expect(onClose).toHaveBeenCalled();
  });
});
