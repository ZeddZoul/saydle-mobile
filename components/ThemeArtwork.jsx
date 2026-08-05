import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { buildArtwork, blurTintFor } from "../theme/artwork.js";

/**
 * The theme's shapes, drifting slowly behind everything else.
 *
 * Each shape gets its own view and its own loop rather than animating SVG
 * properties: transforms on a plain view run on the native driver, so the
 * backdrop costs nothing on the JS thread even while the affirmation is
 * breathing on top of it.
 *
 * `pointerEvents="none"` throughout — this is scenery, and a shape that
 * swallowed a tap on the heart would be a bug nobody would think to look for.
 */
const DriftingShape = ({ shape, index }) => {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: shape.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: shape.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [drift, shape.duration]);

  // Alternating directions, so the shapes don't move as one block.
  const sign = index % 2 === 0 ? 1 : -1;
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shape.distance * sign],
  });
  const translateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shape.distance * -sign * 0.6],
  });

  return (
    <Animated.View
      pointerEvents="none"
      testID="theme-artwork-shape"
      style={{
        position: "absolute",
        left: shape.left,
        top: shape.top,
        width: shape.size,
        height: shape.size,
        opacity: shape.opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Path d={shape.path} fill={shape.color} />
      </Svg>
    </Animated.View>
  );
};

const ThemeArtwork = ({ theme: injectedTheme }) => {
  const { theme: activeTheme } = useAppTheme();
  const theme = injectedTheme ?? activeTheme;
  const { width, height } = useWindowDimensions();

  const shapes = useMemo(
    () => buildArtwork(theme, { width, height }),
    [theme, width, height],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="theme-artwork">
      {shapes.map((shape, index) => (
        <DriftingShape key={shape.key} shape={shape} index={index} />
      ))}

      {/* Blurs the shapes below it into soft glows rather than flat blobs —
          most of what a Skia pipeline would buy, for one native view.

          iOS only on purpose: Android's implementation is far more expensive,
          and this sits behind every screen for the whole session. There the raw
          shapes stand on their own, which is why they are drawn soft and faint
          in the first place. */}
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={38}
          tint={blurTintFor(theme)}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          testID="theme-artwork-blur"
        />
      ) : null}
    </View>
  );
};

export default ThemeArtwork;
