import { render, fireEvent } from "@testing-library/react-native";
import ThemePicker from "../../components/ThemePicker.jsx";
import { THEMES, THEME_SLUGS, getTheme, DEFAULT_THEME } from "../../theme/themes.js";
import { THEME_SLUGS as SERVER_SLUGS } from "../../server/src/config/themes.js";

describe("the theme registry", () => {
  it("resolves a known slug", () => {
    expect(getTheme("midnight").name).toBe("Midnight");
  });

  it("falls back rather than crashing on an unknown or missing slug", () => {
    expect(getTheme("not-a-theme").slug).toBe(DEFAULT_THEME);
    expect(getTheme(undefined).slug).toBe(DEFAULT_THEME);
  });

  it("gives every theme its own type colours, so dark backdrops stay readable", () => {
    for (const theme of THEMES) {
      expect(theme.gradient.length).toBeGreaterThanOrEqual(2);
      expect(theme.ink).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.sub).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("uses light type on dark themes and dark type on light ones", () => {
    // Rough luminance: a dark theme's ink must be bright, and vice versa.
    const brightness = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (r * 299 + g * 587 + b * 114) / 1000;
    };

    for (const theme of THEMES) {
      if (theme.dark) expect(brightness(theme.ink)).toBeGreaterThan(150);
      else expect(brightness(theme.ink)).toBeLessThan(105);
    }
  });

  /**
   * Danger has to be legible on the backdrop it is painted on.
   *
   * It was a single brand token, #C0392B, chosen against white. On Dusk that is
   * 1.8:1 against the page and 1.2:1 on a card — "Delete account" rendered as a
   * smudge, which is the one word on the screen that has to be unmissable. So
   * each theme now carries its own.
   *
   * The bar is 4.5:1 where destructive *actions* live (the page backdrop) and
   * 3:1 at worst — a translucent card over the lightest end of the gradient,
   * where the only thing painted in it is a line of error text. 4.5:1 on a dark
   * card is not reachable by any red: against plum, the only ones that clear it
   * are pale enough to be mistaken for `sub`, and iOS's own destructive red
   * does not clear it either.
   */
  describe("the danger colour", () => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };

    const luminance = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const contrast = (a, b) => {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };

    /** The card is translucent white, so what it reads against is a blend. */
    const over = (alpha, hex) => {
      const mix = (c) => Math.round(alpha * 255 + (1 - alpha) * c);
      const parts = [1, 3, 5].map((i) => mix(parseInt(hex.slice(i, i + 2), 16)));
      return `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    };

    it("is defined for every theme", () => {
      for (const theme of THEMES) expect(theme.danger).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it("clears 4.5:1 against the page, where destructive actions sit", () => {
      for (const theme of THEMES) {
        for (const stop of theme.gradient) {
          expect(contrast(theme.danger, stop)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("clears 3:1 on a card, where error text sits", () => {
      for (const theme of THEMES) {
        const alpha = theme.dark ? 0.14 : 0.72;
        for (const stop of theme.gradient) {
          expect(contrast(theme.danger, over(alpha, stop))).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it("reads as a warning rather than as the accent", () => {
      // Dusk's accent is a coral, so a red delete link risks looking like one
      // more piece of chrome. They have to be separable at a glance.
      for (const theme of THEMES) {
        expect(theme.danger.toLowerCase()).not.toBe(theme.accent.toLowerCase());
      }
    });
  });

  it("stays in sync with the slugs the API accepts", () => {
    // A theme the server rejects would fail to save with no obvious cause.
    expect([...THEME_SLUGS].sort()).toEqual([...SERVER_SLUGS].sort());
  });
});

describe("theming outside a provider", () => {
  const { renderHook } = require("@testing-library/react-native");
  const { useAppTheme } = require("../../contexts/ThemeContext.jsx");

  it("falls back to the default rather than crashing the screen", async () => {
    // A theme is presentational — a missing provider must not take a screen down.
    const { result } = await renderHook(() => useAppTheme());

    expect(result.current.theme.slug).toBe(DEFAULT_THEME);
    expect(() => result.current.setTheme("dusk")).not.toThrow();
  });
});

describe("GradientBackground", () => {
  const GradientBackground = require("../../components/GradientBackground.jsx").default;
  const { Text } = require("react-native");

  it("renders its children on the themed surface", async () => {
    const view = await render(
      <GradientBackground>
        <Text>on theme</Text>
      </GradientBackground>,
    );

    expect(await view.findByText("on theme")).toBeTruthy();
  });

  it("lets a caller override the gradient for previews", async () => {
    const view = await render(
      <GradientBackground colors={["#000000", "#111111"]}>
        <Text>swatch</Text>
      </GradientBackground>,
    );

    expect(await view.findByText("swatch")).toBeTruthy();
  });
});

describe("ThemePicker", () => {
  it("previews every theme by name", async () => {
    const view = await render(<ThemePicker value="dawn" onChange={() => {}} />);

    for (const theme of THEMES) {
      expect(await view.findByLabelText(theme.name)).toBeTruthy();
    }
  });

  it("marks the current theme as selected", async () => {
    const view = await render(<ThemePicker value="sage" onChange={() => {}} />);

    const sage = await view.findByLabelText("Sage");
    expect(sage.props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText("Dawn").props.accessibilityState.selected).toBe(false);
  });

  it("reports the chosen slug", async () => {
    const onChange = jest.fn();
    const view = await render(<ThemePicker value="dawn" onChange={onChange} />);

    await fireEvent.press(await view.findByLabelText("Dusk"));
    expect(onChange).toHaveBeenCalledWith("dusk");
  });
});
