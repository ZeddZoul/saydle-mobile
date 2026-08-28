import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { buildArtwork, blurTintFor } from "../theme/artwork.js";

/**
 * Softness is bought differently on each platform, because it costs differently.
 *
 * iOS blurs the whole field in one native view — cheap there, and it softens the
 * gradient underneath too. Android's blur is far more expensive and this sits
 * behind every screen for the entire session, so the shapes carry their own
 * falloff instead: each one fades out at its edge and reads as a glow without
 * anything having to blur. The two routes are tuned to land in the same place.
 */
const softFill = () => Platform.OS !== "ios";

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
  // Read per render, not once at import: which platform we are on is fixed in
  // production but not in a test, and a module-level constant would bake in
  // whichever platform happened to load the file first.
  const soft = softFill();
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
        // Fading the edge removes roughly a third of a shape's average alpha,
        // so the soft route is nudged back up to land at the same presence the
        // blurred one has. Capped, because these must stay scenery.
        opacity: soft ? Math.min(shape.opacity * 1.35, 0.6) : shape.opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        {soft ? (
          <Defs>
            {/* The shape's own edge, faded out. This is what makes a blob read
                as a glow instead of a sticker, and it costs one gradient on the
                GPU rather than a full-screen blur pass every frame. The stops
                are weighted to hold the middle — a linear falloff drains the
                centre too and the whole composition goes murky. */}
            <RadialGradient id={shape.key} cx="50%" cy="50%" r="55%">
              <Stop offset="0" stopColor={shape.color} stopOpacity="1" />
              <Stop offset="0.45" stopColor={shape.color} stopOpacity="0.92" />
              <Stop offset="0.78" stopColor={shape.color} stopOpacity="0.45" />
              <Stop offset="1" stopColor={shape.color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
        ) : null}

        <Path
          d={shape.path}
          fill={soft ? `url(#${shape.key})` : shape.color}
          testID="theme-artwork-fill"
        />
      </Svg>
    </Animated.View>
  );
};

const ThemeArtwork = ({ theme: injectedTheme }) => {
  const { theme: activeTheme } = useAppTheme();
  const theme = injectedTheme ?? activeTheme;
  const { width, height } = useWindowDimensions();

  const shapes = useMemo(() => buildArtwork(theme, { width, height }), [theme, width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="theme-artwork">
      {shapes.map((shape, index) => (
        <DriftingShape key={shape.key} shape={shape} index={index} />
      ))}

      {/* Blurs the shapes below it into soft glows rather than flat blobs —
          most of what a Skia pipeline would buy, for one native view.

          iOS only on purpose: Android's implementation is far more expensive,
          and this sits behind every screen for the whole session. There the
          shapes fade out at their own edges instead — see softFill. */}
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
