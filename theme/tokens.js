/**
 * The single source of truth for Saydle's visual language.
 *
 * Every screen and component pulls colour, spacing, radius, shadow, and type
 * from here rather than hardcoding hex and numbers — that is what keeps the app
 * feeling like one product as it grows, and what makes a palette change a
 * one-file edit instead of a scavenger hunt.
 */

export const colors = {
  coral: "#FF6F61", // primary
  coralDeep: "#E85D50", // pressed / gradient foot
  coralSoft: "#FF8F84", // gradient head
  mauve: "#C49EBB", // secondary / borders
  mauveDeep: "#7A5A70", // secondary text on light

  // Page gradient, light → warm.
  pinkHi: "#FDEEEC",
  pinkMid: "#FBDCD8",
  pinkLo: "#F7CAC5",

  ink: "#38223A", // primary text — deep plum (Saydle purple, darkened), never black
  inkSoft: "#6B5B65", // secondary text
  inkFaint: "#A4909C", // placeholder / tertiary

  white: "#FFFFFF",
  surface: "#FFFFFF",
  danger: "#C0392B",
};

export const gradients = {
  page: [colors.pinkHi, colors.pinkLo],
  coral: [colors.coralSoft, colors.coral],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

/**
 * iOS reads `shadow*`, Android reads `elevation`.
 *
 * **`elevation` is deliberately absent from the two translucent-surface shadows
 * below.** Android draws an elevation shadow from the view's outline and paints
 * it *under* the view — which is invisible under an opaque card and very visible
 * under one filled with `rgba(255,255,255,0.35)`. It shows through as a hard
 * grey rectangle inside the card, with square corners that ignore the border
 * radius, and it reads as a rendering bug rather than as depth. Confirmed on a
 * device by removing the token: the rectangle went with it.
 *
 * A translucent surface does not need the help anyway — the fill already
 * separates it from the backdrop. `button` keeps its elevation because buttons
 * are opaque.
 */
export const shadow = {
  soft: {
    shadowColor: "#7A2E28",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  card: {
    shadowColor: "#7A2E28",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  button: {
    shadowColor: "#FF6F61",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
};

// Fraunces (an editorial serif) for display; the system sans for UI and body.
// The keys map to the weights loaded in app/_layout.jsx — keep them in sync.
export const fonts = {
  display: "Fraunces_600SemiBold",
  displayBold: "Fraunces_700Bold",
  displayRegular: "Fraunces_400Regular",
  displayItalic: "Fraunces_600SemiBold_Italic",
};

export const type = {
  // The affirmation itself — the one piece of text the whole app exists to show.
  affirmation: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 42,
    letterSpacing: 0.2,
    color: colors.ink,
    textAlign: "center",
  },
  screenTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    // Warm mauve rather than a neutral grey — reads on-brand against the pink.
    color: colors.mauveDeep,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mauveDeep,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
};
