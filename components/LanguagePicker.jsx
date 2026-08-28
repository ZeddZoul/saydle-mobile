import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { LOCALE_NAMES, SUPPORTED_LOCALES } from "../lib/i18n.js";
import { colors, radius, spacing } from "../theme/tokens.js";

/**
 * The languages Saydle can actually be read in.
 *
 * Deliberately a short list rather than every language the device offers: a
 * language appears here only once it has moderation rules and a curated bank
 * behind it (see lib/i18n.js). Offering more would mean generating affirmations
 * we cannot check.
 *
 * Each option is written in its own language — someone looking for Spanish
 * scans for "Español", not for "Spanish".
 */
const LanguagePicker = ({ value, onChange, disabled = false }) => {
  const { theme } = useAppTheme();

  return (
    <View style={styles.row}>
      {SUPPORTED_LOCALES.map((locale) => {
        const active = locale === value;

        return (
          <Pressable
            key={locale}
            disabled={disabled}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(locale);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={LOCALE_NAMES[locale]}
            style={[
              styles.pill,
              { borderColor: theme.border, backgroundColor: theme.surfaceStrong },
              active && { borderColor: theme.accent, backgroundColor: theme.accent },
            ]}
          >
            {active ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
            <Text style={[styles.label, { color: theme.sub }, active && styles.labelActive]}>
              {LOCALE_NAMES[locale]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export default LanguagePicker;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.white,
  },
});
