import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { THEMES } from "../theme/themes.js";
import { colors, radius, shadow, spacing } from "../theme/tokens.js";
import { useAppTheme } from "../contexts/ThemeContext.jsx";

/**
 * The scene every backdrop carries — sun, hills, one spark — drawn in the
 * theme's own ink. Same hand as the profile tiles and the empty states, so a
 * swatch is a miniature of the real thing rather than a paint chip. The hills
 * run edge to edge of the card on purpose, exactly as they do on the theme
 * tile's front card.
 */
const SwatchScene = ({ ink }) => (
  <Svg viewBox="0 0 84 60" style={styles.scene} fill="none">
    <Path d="M58 11a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z" stroke={ink} strokeWidth="1.4" />
    <Path d="M0 46c14-24 28-24 40 0" stroke={ink} strokeWidth="1.4" fill="none" />
    <Path
      d="M28 46c16-20 36-20 56 0"
      stroke={ink}
      strokeWidth="1.2"
      opacity="0.7"
      fill="none"
    />
    <Path
      d="M14 7c.8 2.8 2.2 4.2 5 5c-2.8 .8-4.2 2.2-5 5c-.8-2.8-2.2-4.2-5-5c2.8-.8 4.2-2.2 5-5Z"
      stroke={ink}
      strokeWidth="1"
      opacity="0.6"
      fill="none"
    />
  </Svg>
);

/**
 * A grid of theme swatches, each previewing the wordmark in that theme's own
 * type colour — so the choice is made on what an affirmation will actually look
 * like, not on an abstract colour chip.
 */
const ThemePicker = ({ value, onChange, disabled = false }) => {
  const { theme: active } = useAppTheme();

  return (
    <View style={styles.grid}>
      {THEMES.map((theme) => {
        const selected = theme.slug === value;

        return (
          <Pressable
            key={theme.slug}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(theme.slug);
            }}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={theme.name}
            style={styles.cell}
          >
            <LinearGradient
              colors={theme.gradient}
              style={[styles.swatch, selected && { borderColor: theme.accent }]}
            >
              <SwatchScene ink={theme.ink} />
              <DisplayText weight="bold" style={[styles.preview, { color: theme.ink }]}>
                Saydle
              </DisplayText>

              {selected ? (
                <View style={[styles.check, { backgroundColor: theme.accent }]}>
                  <Ionicons name="checkmark" size={13} color={colors.white} />
                </View>
              ) : null}
            </LinearGradient>

            <DisplayText style={[styles.name, { color: active.sub }]}>{theme.name}</DisplayText>
          </Pressable>
        );
      })}
    </View>
  );
};

export default ThemePicker;

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  cell: {
    // Three across, accounting for the gaps between them.
    width: "30%",
    alignItems: "center",
    gap: spacing.sm,
  },
  swatch: {
    width: "100%",
    aspectRatio: 0.72,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    ...shadow.soft,
  },
  swatchSelected: {
    borderColor: colors.coral,
  },
  scene: {
    width: "100%",
    aspectRatio: 84 / 60,
    marginBottom: spacing.xs,
  },
  preview: {
    fontSize: 13,
  },
  check: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 12,
    color: colors.mauveDeep,
  },
});
