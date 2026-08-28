import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { radius } from "../theme/tokens.js";

const AnimatedView = Animated.createAnimatedComponent(View);

/**
 * The affirmation, inside the thing that measures it.
 *
 * Practice used to stack three separate elements — a "0 of 7" scoreboard, the
 * words, and a row of small dots — so the screen had no centre and nothing
 * looked tappable. They are one object now: a ring of segments around the line
 * itself, filling as you say it.
 *
 * The ring is also the breath guide. In guided mode the disc inside it expands
 * and contracts, so pacing and progress share one shape rather than competing
 * for the same attention. A second animated circle somewhere else on screen
 * would just be a distraction from the words.
 *
 * Each segment keeps the testIDs the rep dots used, because what they represent
 * has not changed — only how it looks.
 */
const PracticeRing = ({ target = 7, count = 0, size = 300, stroke = 5, breath, children }) => {
  const { theme } = useAppTheme();

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = target > 1 ? 10 : 0;
  const segment = circumference / target - gap;

  // Each new segment eases in rather than snapping, so a tap feels like it
  // landed somewhere rather than incrementing a counter.
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => grow.setValue(0);
  }, [count, grow]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {breath ? (
        <AnimatedView
          style={[
            styles.disc,
            {
              width: size - stroke * 4,
              height: size - stroke * 4,
              backgroundColor: theme.accent,
              opacity: 0.1,
              transform: [{ scale: breath }],
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: target }).map((_, i) => {
          const filled = i < count;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={filled ? theme.accent : theme.border}
              strokeWidth={filled ? stroke : stroke - 1.5}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${segment} ${circumference - segment}`}
              // Negative offset walks each segment round the circle; the -90°
              // rotation puts the first one at the top rather than at 3 o'clock.
              strokeDashoffset={-(i * (circumference / target)) - gap / 2}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              opacity={filled ? 1 : 0.55}
              testID={filled ? "practice-dot-filled" : "practice-dot"}
            />
          );
        })}
      </Svg>

      <View style={styles.content}>{children}</View>
    </View>
  );
};

export default PracticeRing;

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  disc: { position: "absolute", borderRadius: radius.pill },
  // Inset so a long affirmation wraps inside the ring instead of over it.
  content: { paddingHorizontal: 34, alignItems: "center", justifyContent: "center" },
});
