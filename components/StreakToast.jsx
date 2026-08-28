import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import StreakStrip from "./StreakStrip.jsx";
import { spacing } from "../theme/tokens.js";

/** How long it stays before getting out of the way. */
const HOLD_MS = 2800;

/**
 * The streak, shown once — at the moment it moves — and then gone.
 *
 * This exists instead of a permanent counter on Today, and the difference is
 * the whole point. A strip that lives on the screen is a scoreboard: every time
 * someone opens the app it shows them the days they missed, which is precisely
 * the shape of thing an affirmation like "my worth holds steady on an
 * unproductive day" exists to argue against.
 *
 * Shown only on the day it changes, it is the opposite: a small acknowledgement
 * of something you just did, that then leaves you alone with the words.
 *
 * Tappable to dismiss early, and never blocks what is underneath.
 */
const StreakToast = ({ streak, visible, onHide }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;

    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    timer.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 520,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => finished && onHide?.());
    }, HOLD_MS);

    return () => clearTimeout(timer.current);
  }, [visible, anim, onHide]);

  if (!visible || !streak) return null;

  // Rises into place, because it now comes up from the bottom edge.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View
      style={[styles.wrap, { opacity: anim, transform: [{ translateY }] }]}
      pointerEvents="box-none"
      testID="streak-toast"
    >
      <Pressable
        onPress={() => {
          clearTimeout(timer.current);
          onHide?.();
        }}
        accessibilityRole="button"
        // Announced as a status rather than a control: it is news, not a task.
        accessibilityLiveRegion="polite"
        testID="streak-toast-dismiss"
      >
        <StreakStrip streak={streak} />
      </Pressable>
    </Animated.View>
  );
};

export default StreakToast;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    // Bottom, not top. Anchored to the top it landed exactly on the greeting —
    // the toast fires on the same frame Today first paints, so a new account's
    // very first screen was "1 day in a row" sitting across their own name.
    // Down here it overlaps nothing: the tab bar is below the screen, and the
    // affirmation is optically centred well above.
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
  },
});
