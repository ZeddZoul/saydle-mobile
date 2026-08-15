import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import ThemeArtwork from "./ThemeArtwork.jsx";

/**
 * The standard page surface.
 *
 * Defaults to the active theme's gradient, so a theme change repaints every
 * screen without each one wiring it up. Pass `colors` to override (previews,
 * swatches), or `brand` for surfaces that should stay on-brand regardless of
 * the user's theme.
 *
 * The theme's artwork rides along on top of the gradient and under everything
 * else. It is off for `colors`/`brand` surfaces: a swatch is a colour sample,
 * and a brand surface should look like Saydle rather than like the user's
 * chosen theme. Pass `artwork={false}` anywhere the shapes would be noise.
 */
const GradientBackground = ({ colors, brand = false, artwork, style, children, ...props }) => {
  const { theme } = useAppTheme();
  const gradient = colors ?? (brand ? ["#FDEEEC", "#F7CAC5"] : theme.gradient);
  const showArtwork = artwork ?? (!colors && !brand);

  return (
    <LinearGradient colors={gradient} style={[styles.fill, style]} {...props}>
      {showArtwork ? <ThemeArtwork /> : null}
      {children}
    </LinearGradient>
  );
};

export default GradientBackground;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
