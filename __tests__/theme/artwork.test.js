import { buildArtwork, blurTintFor, ARTWORK_SLUGS } from "../../theme/artwork.js";
import { THEMES, THEME_SLUGS, getTheme } from "../../theme/themes.js";

const SCREEN = { width: 390, height: 844 };

describe("buildArtwork", () => {
  it("gives every theme a composition of its own", () => {
    // Otherwise a theme silently falls back and switching to it changes nothing.
    expect([...ARTWORK_SLUGS].sort()).toEqual([...THEME_SLUGS].sort());
  });

  it("is deterministic — a theme looks the same every launch", () => {
    // A backdrop that reshuffles itself is a different app each morning.
    const first = buildArtwork(getTheme("sage"), SCREEN);
    const second = buildArtwork(getTheme("sage"), SCREEN);

    expect(first.map((s) => s.path)).toEqual(second.map((s) => s.path));
  });

  it("gives different themes genuinely different shapes, not a recolour", () => {
    const dawn = buildArtwork(getTheme("dawn"), SCREEN);
    const sky = buildArtwork(getTheme("sky"), SCREEN);

    expect(dawn.map((s) => s.path)).not.toEqual(sky.map((s) => s.path));
  });

  it("draws only in the active theme's colours", () => {
    for (const theme of THEMES) {
      const palette = [theme.accent, theme.accentSoft, theme.border];
      const strays = buildArtwork(theme, SCREEN).filter((s) => !palette.includes(s.color));

      expect(strays).toEqual([]);
    }
  });

  it("stays faint enough to read through", () => {
    // The affirmation is the point; the backdrop must never compete. The
    // ceilings differ because the same value reads far brighter on a dark
    // backdrop — and because the blur pass softens light themes considerably
    // more than it does dark ones.
    for (const theme of THEMES) {
      const ceiling = theme.dark ? 0.2 : 0.32;

      for (const shape of buildArtwork(theme, SCREEN)) {
        expect(shape.opacity).toBeLessThanOrEqual(ceiling);
        expect(shape.opacity).toBeGreaterThan(0);
      }
    }
  });

  it("keeps dark themes fainter still", () => {
    // The same opacity reads far brighter against a dark backdrop.
    const brightest = (slug) =>
      Math.max(...buildArtwork(getTheme(slug), SCREEN).map((s) => s.opacity));

    expect(brightest("midnight")).toBeLessThan(brightest("dawn"));
    expect(brightest("dusk")).toBeLessThan(brightest("blush"));
  });

  it("scales with the screen rather than assuming a phone", () => {
    const phone = buildArtwork(getTheme("dawn"), SCREEN);
    const tablet = buildArtwork(getTheme("dawn"), { width: 1024, height: 1366 });

    expect(tablet[0].size).toBeGreaterThan(phone[0].size);
  });

  it("produces a closed SVG path for every shape", () => {
    for (const shape of buildArtwork(getTheme("blush"), SCREEN)) {
      expect(shape.path).toMatch(/^M[\d.,]/);
      expect(shape.path.endsWith("Z")).toBe(true);
    }
  });

  it("falls back rather than crashing on an unknown theme", () => {
    const shapes = buildArtwork({ slug: "nope", accent: "#123456" }, SCREEN);

    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.every((s) => s.color === "#123456")).toBe(true);
  });

  it("survives being handed nothing at all", () => {
    expect(buildArtwork(undefined, SCREEN).length).toBeGreaterThan(0);
  });
});

describe("blurTintFor", () => {
  it("follows the theme, not the system appearance", () => {
    // A light blur over a midnight backdrop washes it grey.
    expect(blurTintFor(getTheme("midnight"))).toBe("dark");
    expect(blurTintFor(getTheme("dusk"))).toBe("dark");
    expect(blurTintFor(getTheme("dawn"))).toBe("light");
  });

  it("leans light when handed nothing", () => {
    expect(blurTintFor(undefined)).toBe("light");
  });
});
