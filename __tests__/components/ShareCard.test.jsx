import { render } from "@testing-library/react-native";
import ShareCard, { RATIOS } from "../../components/ShareCard.jsx";
import { getTheme } from "../../theme/themes.js";

const props = {
  text: "I get to carry today a little more lightly.",
  date: "2026-08-05",
  theme: getTheme("dawn"),
};

describe("ShareCard", () => {
  it("puts the affirmation on the card", async () => {
    const { findByText } = await render(<ShareCard {...props} />);
    expect(await findByText(props.text)).toBeTruthy();
  });

  it("carries the wordmark, so a shared card is recognisably Saydle", async () => {
    const { findByText } = await render(<ShareCard {...props} />);
    expect(await findByText("SAYDLE")).toBeTruthy();
  });

  it("dates the card, quietly", async () => {
    const { findByText } = await render(<ShareCard {...props} />);
    const date = await findByText(/August 5/);

    // Present for context, never competing with the sentence.
    const style = Array.isArray(date.props.style)
      ? Object.assign({}, ...date.props.style.filter(Boolean))
      : date.props.style;
    expect(style.opacity).toBeLessThan(0.5);
  });

  it("is square by default and tall for a story", async () => {
    const square = await render(<ShareCard {...props} width={300} />);
    expect((await square.findByTestId("share-card")).props.style).toMatchObject({
      width: 300,
      height: 300,
    });

    const story = await render(<ShareCard {...props} width={300} ratio={RATIOS.story} />);
    const { height } = (await story.findByTestId("share-card")).props.style;
    expect(height).toBeGreaterThan(300);
  });

  it("takes every colour from the theme it is handed", async () => {
    const midnight = getTheme("midnight");
    const { findByText } = await render(<ShareCard {...props} theme={midnight} />);

    const wordmark = await findByText("SAYDLE");
    const style = Array.isArray(wordmark.props.style)
      ? Object.assign({}, ...wordmark.props.style.filter(Boolean))
      : wordmark.props.style;

    expect(style.color).toBe(midnight.accent);
  });

  it("carries the theme's artwork, like every other Saydle surface", async () => {
    const { findByTestId } = await render(<ShareCard {...props} />);
    expect(await findByTestId("theme-artwork")).toBeTruthy();
  });

  it("stays capturable — the ref must reach a real view", async () => {
    // react-native-view-shot photographs by ref; `collapsable={false}` is what
    // stops RN optimising the view away and leaving nothing to capture.
    const { findByTestId } = await render(<ShareCard {...props} />);
    expect((await findByTestId("share-card")).props.collapsable).toBe(false);
  });
});
