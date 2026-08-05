/**
 * Affirmation themes — the palette the whole app is rendered in.
 *
 * Each theme is SELF-CONTAINED: backdrop, type colours, accent, and surface
 * colours. Components pull everything from the active theme rather than the
 * brand tokens, otherwise a coral avatar strands itself on a green backdrop.
 *
 * Contrast is part of the definition, not an afterthought: a dark backdrop
 * needs light type, and an affirmation nobody can read is a broken feature.
 *
 *   gradient    page backdrop, top → bottom
 *   ink / sub   primary / secondary type
 *   accent      interactive colour (buttons, selection, the heart)
 *   accentSoft  lighter accent, for the primary button's gradient
 *   surface     translucent card fill that sits on the backdrop
 *   border      hairlines: chip outlines, unfilled dots
 *   dark        backdrop is dark, so chrome should sit with it
 *
 * Gradients only for now — real photo/video themes need an asset pipeline. When
 * art arrives, add `image`/`video` here and teach the background to render it.
 */
const light = {
  surface: "rgba(255,255,255,0.35)",
  surfaceStrong: "rgba(255,255,255,0.72)",
  dark: false,
};

const dark = {
  surface: "rgba(255,255,255,0.08)",
  surfaceStrong: "rgba(255,255,255,0.14)",
  dark: true,
};

export const THEMES = [
  {
    slug: "dawn",
    name: "Dawn",
    gradient: ["#FDEEEC", "#F7CAC5"],
    ink: "#38223A",
    sub: "#7A5A70",
    accent: "#FF6F61",
    accentSoft: "#FF8F84",
    border: "#C49EBB",
    ...light,
  },
  {
    slug: "blush",
    name: "Blush",
    gradient: ["#FFF1E8", "#F6C9C0"],
    ink: "#3A2430",
    sub: "#8A5F63",
    accent: "#E8735E",
    accentSoft: "#F0937F",
    border: "#D8A79C",
    ...light,
  },
  {
    slug: "sage",
    name: "Sage",
    gradient: ["#F0F4EC", "#CBDAC6"],
    ink: "#26332A",
    sub: "#5B6E5E",
    accent: "#5E8C6A",
    accentSoft: "#7FA98A",
    border: "#A8BFA6",
    ...light,
  },
  {
    slug: "sky",
    name: "Sky",
    gradient: ["#EEF4FA", "#C7DCEC"],
    ink: "#1F2E3D",
    sub: "#546C82",
    accent: "#4A7FA8",
    accentSoft: "#6D9CC0",
    border: "#A3BDD2",
    ...light,
  },
  {
    slug: "dusk",
    name: "Dusk",
    gradient: ["#5B3A56", "#2E1F33"],
    ink: "#F6E9EE",
    sub: "#C9AEBE",
    accent: "#FF8F84",
    accentSoft: "#FFAAA0",
    border: "#7C5E77",
    ...dark,
  },
  {
    slug: "midnight",
    name: "Midnight",
    gradient: ["#243347", "#131A26"],
    ink: "#EAF0F7",
    sub: "#A9BACB",
    accent: "#7FB2D9",
    accentSoft: "#9FC7E5",
    border: "#3E5570",
    ...dark,
  },
];

export const DEFAULT_THEME = "dawn";

export const THEME_SLUGS = THEMES.map((theme) => theme.slug);

/** Always returns a usable theme — an unknown slug falls back rather than crashing. */
export function getTheme(slug) {
  return THEMES.find((theme) => theme.slug === slug) ?? THEMES[0];
}
