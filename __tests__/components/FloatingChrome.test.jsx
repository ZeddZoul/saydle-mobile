import { render, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import FloatingChrome from "../../components/FloatingChrome.jsx";

// The chrome reads insets from the hook (the wrapper view must own
// `pointerEvents` itself), so tests provide the metrics a device would.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The controls replaced a header bar and a tab bar. What matters is that they
 * are reachable, labelled, and — critically — that they do not swallow the
 * gestures meant for the affirmation they float over.
 */
const renderChrome = (props = {}) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <FloatingChrome kept={0} {...props} />
    </SafeAreaProvider>,
  );

describe("FloatingChrome", () => {
  it("offers every destination the bars used to", async () => {
    const { findByTestId } = await renderChrome();

    for (const id of [
      "chrome-profile",
      "chrome-premium",
      "chrome-categories",
      "chrome-practice",
      "chrome-themes",
    ]) {
      expect(await findByTestId(id)).toBeTruthy();
    }
  });

  it("calls through when tapped", async () => {
    const onPractice = jest.fn();
    const { findByTestId } = await renderChrome({ onPractice });

    await fireEvent.press(await findByTestId("chrome-practice"));

    expect(onPractice).toHaveBeenCalled();
  });

  it("never swallows a gesture meant for what is underneath", async () => {
    const { findByTestId } = await renderChrome();
    const overlay = await findByTestId("kept-meter");

    // The overlay covers the whole screen. `box-none` on its container is the
    // only reason the affirmation beneath it can still be swiped or tapped.
    let node = overlay.parent;
    let sawBoxNone = false;
    while (node) {
      if (node.props?.pointerEvents === "box-none") sawBoxNone = true;
      node = node.parent;
    }
    expect(sawBoxNone).toBe(true);
  });

  it("counts what they kept rather than days they missed", async () => {
    const { findByText } = await renderChrome({ kept: 3, goal: 5 });

    // A streak counts days you did not miss, which on a bad week reads as a
    // list of failures. This can only go up.
    expect(await findByText("3/5")).toBeTruthy();
  });

  it("reports progress to assistive tech, not just visually", async () => {
    const { findByTestId } = await renderChrome({ kept: 2, goal: 5 });
    const meter = await findByTestId("kept-meter");

    expect(meter.props.accessibilityValue).toMatchObject({ now: 2, max: 5 });
  });
});
