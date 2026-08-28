import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "../../theme/tokens.js";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";

/**
 * One selectable answer row — a rounded pill whose whole colour system shifts to
 * coral when chosen (border, label, and the check), so selection reads clearly
 * without leaning on per-option icons. Used for single- and multi-select.
 */
const OptionRow = ({ label, selected, multi = false, onPress, disabled = false }) => {
  const { theme } = useAppTheme();

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ selected, checked: selected, disabled }}
      style={[
        styles.row,
        { borderColor: theme.border, backgroundColor: theme.surface },
        selected && { borderColor: theme.accent, backgroundColor: theme.surfaceStrong },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: theme.ink },
          selected && [styles.labelSelected, { color: theme.accent }],
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.indicator,
          { borderColor: theme.border },
          selected && { backgroundColor: theme.accent, borderColor: theme.accent },
        ]}
      >
        {selected ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
      </View>
    </Pressable>
  );
};

export default OptionRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.mauve,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginBottom: spacing.md,
  },
  rowSelected: {
    borderColor: colors.coral,
    backgroundColor: "rgba(255,111,97,0.1)",
  },
  label: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingRight: spacing.md,
  },
  labelSelected: {
    color: colors.coral,
    fontWeight: "600",
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.mauve,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorSelected: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
});
