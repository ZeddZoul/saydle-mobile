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
    const { queryByTestId } = await render(<GradientBackground colors={["#fff", "#eee"]} />);
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

describe("softness where there is no blur", () => {
  const onAndroid = async (assert) => {
    const { Platform } = require("react-native");
    const original = Platform.OS;
    Platform.OS = "android";

    try {
      await assert();
    } finally {
      Platform.OS = original;
    }
  };

  // react-native-svg normalises `fill` before it reaches the host view: a flat
  // colour arrives as { type: 0, payload }, a `url(#id)` reference as
  // { type: 1, brushRef }. The brush is the assertion — it says the shape is
  // painted with its own gradient rather than a solid.
  const firstFill = async (view) =>
    (await view.findAllByTestId("theme-artwork-fill"))[0].props.fill;

  it("fades each shape out at its edge, so a blob reads as a glow", async () =>
    onAndroid(async () => {
      const view = await render(<ThemeArtwork theme={getTheme("dawn")} />);
      const shapes = await view.findAllByTestId("theme-artwork-shape");

      // The difference between a soft glow and the sticker Android used to draw.
      expect(await firstFill(view)).toMatchObject({ brushRef: expect.any(String) });
      // Every shape gets its own, or they would all share one shape's colour.
      const brushes = (await view.findAllByTestId("theme-artwork-fill")).map(
        (f) => f.props.fill.brushRef,
      );
      expect(new Set(brushes).size).toBe(shapes.length);
    }));

  it("leaves iOS on flat fills, because the blur pass already softens them", async () => {
    const view = await render(<ThemeArtwork theme={getTheme("dawn")} />);
    expect(await firstFill(view)).not.toHaveProperty("brushRef");
  });

  it("carries more alpha than the blurred route, to land at the same presence", async () => {
    const flat = await render(<ThemeArtwork theme={getTheme("dawn")} />);
    const iosOpacity = (await flat.findAllByTestId("theme-artwork-shape"))[0].props.style.opacity;

    await onAndroid(async () => {
      const soft = await render(<ThemeArtwork theme={getTheme("dawn")} />);
      const androidOpacity = (await soft.findAllByTestId("theme-artwork-shape"))[0].props.style
        .opacity;

      // Fading the edge costs average alpha; without the nudge the shapes all
      // but vanish, which is the state this started in.
      expect(androidOpacity).toBeGreaterThan(iosOpacity);
      expect(androidOpacity).toBeLessThanOrEqual(0.6);
    });
  });
});
