import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/tokens.js";

/**
 * A single twinkling sparkle — fades and scales in and out on a loop, with a
 * per-sparkle delay so the field shimmers rather than pulsing in unison.
 */
const Sparkle = ({ left, top, size, color, delay, duration }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sparkle,
        { left, top },
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "22deg"] }) },
          ],
        },
      ]}
    >
      <MaterialCommunityIcons name="star-four-points" size={size} color={color} />
    </Animated.View>
  );
};

// Scattered around the wordmark. Positions are within the hero box's coordinate
// space (see the landing screen). A mix of coral, gold, and white catches the
// eye without any one colour dominating.
const FIELD = [
  { left: "12%", top: "8%", size: 22, color: colors.coral, delay: 0, duration: 1900 },
  { left: "82%", top: "18%", size: 16, color: "#E4A98C", delay: 600, duration: 2100 },
  { left: "70%", top: "2%", size: 12, color: colors.white, delay: 1200, duration: 1700 },
  { left: "6%", top: "58%", size: 14, color: "#E4A98C", delay: 300, duration: 2000 },
  { left: "88%", top: "62%", size: 20, color: colors.coral, delay: 900, duration: 2200 },
  { left: "30%", top: "82%", size: 12, color: colors.white, delay: 1500, duration: 1800 },
  { left: "50%", top: "-4%", size: 14, color: colors.coral, delay: 1800, duration: 2000 },
  { left: "94%", top: "40%", size: 11, color: colors.white, delay: 500, duration: 1600 },
];

const Sparkles = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {FIELD.map((s, i) => (
      <Sparkle key={i} {...s} />
    ))}
  </View>
);

export default Sparkles;

const styles = StyleSheet.create({
  sparkle: {
    position: "absolute",
  },
});
