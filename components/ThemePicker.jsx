import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { THEMES } from "../theme/themes.js";
import { colors, radius, shadow, spacing } from "../theme/tokens.js";
import { useAppTheme } from "../contexts/ThemeContext.jsx";

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
  preview: {
    fontSize: 15,
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
