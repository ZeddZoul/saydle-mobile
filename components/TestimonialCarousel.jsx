import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/tokens.js";
import { useT } from "../lib/i18n.js";

/**
 * A five-star rating with a testimonial that cross-fades between quotes.
 *
 * NOTE: these are PLACEHOLDER quotes. Replace them with real, attributable
 * testimonials before shipping — and don't pair them with a user/download count
 * you can't substantiate.
 */
const ROTATE_MS = 3600;
const FADE_MS = 400;

const Stars = () => {
  const { t } = useT();

  return (
    <View style={styles.stars} accessibilityLabel={t("landing.rating")}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name="star" size={15} color={colors.coral} />
      ))}
    </View>
  );
};

const TestimonialCarousel = () => {
  const { t } = useT();
  // Read inside the component, so switching language swaps the quotes too.
  const QUOTES = t("landing.testimonials");
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % QUOTES.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [fade, QUOTES.length]);

  return (
    <View style={styles.card}>
      <Stars />
      {/* Fixed-height, centered box reserving two lines — so the card never
          resizes as quotes of different lengths rotate through. */}
      <View style={styles.quoteBox}>
        <Animated.Text
          numberOfLines={2}
          style={[styles.quote, { opacity: fade }]}
          accessibilityRole="text"
        >
          &ldquo;{QUOTES[index]}&rdquo;
        </Animated.Text>
      </View>
    </View>
  );
};

export default TestimonialCarousel;

const styles = StyleSheet.create({
  // No panel: the card's width tracked the quote's length, so it visibly
  // resized on every rotation. Floating the stars and text straight on the
  // gradient removes the edge that made the change readable at all.
  card: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  stars: {
    flexDirection: "row",
    gap: 3,
  },
  // Height reserves exactly two lines (2 × lineHeight), so one- and two-line
  // quotes occupy the same space and the card stays put.
  quoteBox: {
    height: 44,
    justifyContent: "center",
  },
  quote: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
    color: colors.mauveDeep,
    textAlign: "center",
  },
});
