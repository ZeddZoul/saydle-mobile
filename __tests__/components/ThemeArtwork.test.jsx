import { render } from "@testing-library/react-native";
import ThemeArtwork from "../../components/ThemeArtwork.jsx";
import GradientBackground from "../../components/GradientBackground.jsx";
import { getTheme } from "../../theme/themes.js";
import { buildArtwork } from "../../theme/artwork.js";

describe("ThemeArtwork", () => {
  it("renders one shape per composition entry", async () => {
    const theme = getTheme("dawn");
    const { findAllByTestId } = await render(<ThemeArtwork theme={theme} />);

    const expected = buildArtwork(theme, { width: 750, height: 1334 }).length;
    expect(await findAllByTestId("theme-artwork-shape")).toHaveLength(expected);
  });

  it("never intercepts a touch — it is scenery, not a control", async () => {
    // A shape swallowing a tap on the heart would be a bug nobody looks for.
    const { findByTestId } = await render(<ThemeArtwork theme={getTheme("sage")} />);

    expect((await findByTestId("theme-artwork")).props.pointerEvents).toBe("none");
  });
});

describe("GradientBackground", () => {
  it("carries the theme's artwork by default", async () => {
    const { findByTestId } = await render(<GradientBackground />);
    expect(await findByTestId("theme-artwork")).toBeTruthy();
  });

  it("leaves it off a colour swatch — a sample should show the colour, nothing else", async () => {
    const { queryByTestId } = await render(
      <GradientBackground colors={["#fff", "#eee"]} />,
    );
    expect(queryByTestId("theme-artwork")).toBeNull();
  });

  it("leaves it off brand surfaces, which shouldn't wear a personal theme", async () => {
    const { queryByTestId } = await render(<GradientBackground brand />);
    expect(queryByTestId("theme-artwork")).toBeNull();
  });

  it("can be turned off explicitly where the shapes would be noise", async () => {
    const { queryByTestId } = await render(<GradientBackground artwork={false} />);
    expect(queryByTestId("theme-artwork")).toBeNull();
  });
});

describe("the blur pass", () => {
  it("softens the shapes on iOS", async () => {
    // What turns flat blobs into glows — most of a Skia pipeline for one view.
    const { findByTestId } = await render(<ThemeArtwork theme={getTheme("dawn")} />);
    expect(await findByTestId("theme-artwork-blur")).toBeTruthy();
  });

  it("is skipped on Android, where it would cost far more than it gives", async () => {
    const { Platform } = require("react-native");
    const original = Platform.OS;
    Platform.OS = "android";

    try {
      const { queryByTestId } = await render(<ThemeArtwork theme={getTheme("dawn")} />);
      expect(queryByTestId("theme-artwork-blur")).toBeNull();
    } finally {
      Platform.OS = original;
    }
  });
});
