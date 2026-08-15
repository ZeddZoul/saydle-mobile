import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import DisplayText from "./DisplayText.jsx";
import ThemeArtwork from "./ThemeArtwork.jsx";
import { formatFriendlyDate } from "../lib/dates.js";
import { radius, spacing } from "../theme/tokens.js";

/** Square for a feed, tall for a story. Both are what people actually post to. */
export const RATIOS = {
  square: { key: "square", ratio: 1 },
  story: { key: "story", ratio: 9 / 16 },
};

/**
 * The image people share.
 *
 * Deliberately built from the same parts as the home-screen widget — the
 * generative blobs, the quote set behind the text, the dot-and-SAYDLE lockup.
 * These are the two places Saydle appears outside the app, and someone who sees
 * a shared card and later installs it should recognise what they downloaded.
 *
 * A forwardRef because react-native-view-shot captures by ref: this renders as
 * an ordinary view and is photographed as-is, so what the reader previews is
 * exactly what gets sent.
 */
const ShareCard = forwardRef(
  ({ text, date, theme, ratio = RATIOS.square, width = 320 }, ref) => {
    const height = Math.round(width / ratio.ratio);
    const isStory = ratio.key === "story";

    // The type scales with the card so a story doesn't render a lost little
    // sentence in the middle of a tall frame.
    const size = isStory ? width * 0.085 : width * 0.075;

    return (
      <View ref={ref} collapsable={false} style={{ width, height }} testID="share-card">
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderRadius: radius.xl }]}
        >
          <ThemeArtwork theme={theme} />

          <View style={[styles.body, { padding: width * 0.09 }]}>
            <View style={styles.lockup}>
              <View style={[styles.dot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.wordmark, { color: theme.accent, fontSize: size * 0.42 }]}>
                SAYDLE
              </Text>
            </View>

            <View style={styles.middle}>
              {/* The quote sits ABOVE the text in its own row rather than
                  behind it. Overlapped, its heavy serif tail cut straight
                  through the first line's capitals — at this size the glyph is
                  too solid to sit behind anything and still be legible. It gets
                  its own space, tight enough to still read as one unit. */}
              <View>
                <DisplayText
                  weight="bold"
                  style={[
                    styles.quote,
                    {
                      color: theme.accent,
                      fontSize: size * 2.2,
                      opacity: theme.dark ? 0.28 : 0.34,
                      // Fraunces sets its quotes high in the em box, so the
                      // glyph's own line box is mostly empty space beneath it.
                      // The negative margin closes that gap without letting the
                      // mark touch the text.
                      height: size * 1.5,
                      marginBottom: -size * 0.18,
                      marginLeft: -size * 0.06,
                    },
                  ]}
                >
                  &ldquo;
                </DisplayText>

                <DisplayText
                  style={[
                    styles.text,
                    { color: theme.ink, fontSize: size, lineHeight: size * 1.45 },
                  ]}
                >
                  {text}
                </DisplayText>
              </View>
            </View>

            {/* Almost unnoticeable on purpose — it dates the card without
              competing with the sentence, which is the only thing worth reading. */}
            <Text style={[styles.date, { color: theme.ink, fontSize: size * 0.32 }]}>
              {formatFriendlyDate(date)}
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  },
);

ShareCard.displayName = "ShareCard";

export default ShareCard;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    justifyContent: "space-between",
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
  wordmark: {
    fontWeight: "700",
    letterSpacing: 2.2,
  },
  middle: {
    flex: 1,
    justifyContent: "center",
    // Optically centred between the lockup and the date rather than
    // mathematically centred, which read as top-heavy on a square card.
    paddingBottom: "6%",
  },
  quote: {
    // Not absolute: overlapping the text made the serif tail slice through the
    // first line. It occupies its own space now.
    includeFontPadding: false,
  },
  text: {
    textAlign: "left",
  },
  date: {
    opacity: 0.42,
    letterSpacing: 0.3,
  },
});
