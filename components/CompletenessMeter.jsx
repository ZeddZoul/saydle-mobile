import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { radius, spacing } from "../theme/tokens.js";

/**
 * How personalized this account is, as a slim bar.
 *
 * Framed as "personalized", never as "complete" — nothing in the app is gated on
 * it, and a bar that reads as an unfinished chore invites exactly the anxious
 * completionism affirmations are supposed to ease.
 */
const CompletenessMeter = ({ percent = 0, label, style }) => {
  const { theme } = useAppTheme();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: clamped,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      // Animating width can't run on the UI thread; the bar is small and this
      // plays once per mount.
      useNativeDriver: false,
    }).start();
  }, [clamped, fill]);

  const width = fill.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={style}>
      <View
        style={[styles.track, { backgroundColor: theme.surfaceStrong }]}
        // Without this the bar is decoration to a screen reader — the role and
        // value below are only announced on an accessibility element.
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: clamped }}
        testID="completeness-track"
      >
        <Animated.View style={[styles.fill, { width, backgroundColor: theme.accent }]} />
      </View>
      {label ? <Text style={[styles.label, { color: theme.sub }]}>{label}</Text> : null}
    </View>
  );
};

export default CompletenessMeter;

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
