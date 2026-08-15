import { StyleSheet, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useT } from "../lib/i18n.js";
import { radius, spacing } from "../theme/tokens.js";

/**
 * The app's controls, floating over the affirmation instead of framing it.
 *
 * A header bar and a tab bar between them take about 170dp — on a phone that is
 * a quarter of the screen spent on furniture, permanently, around a product
 * whose entire content is one sentence. These float instead: the backdrop runs
 * edge to edge, the line sits in open space, and the controls are there when
 * you look for them.
 *
 * Everything here is translucent and theme-coloured rather than white, so the
 * chrome belongs to whatever theme is on rather than sitting on top of it.
 */
const Pill = ({ icon, label, onPress, accessibilityLabel, testID, theme, wide }) => (
  <Pressable
    onPress={() => {
      Haptics.selectionAsync().catch(() => {});
      onPress?.();
    }}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    testID={testID}
    style={({ pressed }) => [
      styles.pill,
      wide && styles.pillWide,
      {
        backgroundColor: theme.dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.55)",
        borderColor: theme.border,
      },
      pressed && styles.pressed,
    ]}
  >
    <Ionicons name={icon} size={18} color={theme.ink} />
    {label ? <Text style={[styles.pillText, { color: theme.ink }]}>{label}</Text> : null}
  </Pressable>
);

/**
 * How many they have kept, and how far to the next handful.
 *
 * Deliberately not a streak. A streak counts days you did not miss, which on a
 * bad week is a list of failures; this counts lines that landed, which can only
 * ever go up.
 */
const KeptMeter = ({ kept, goal, theme }) => {
  const filled = Math.min(1, goal === 0 ? 0 : (kept % goal || (kept > 0 ? goal : 0)) / goal);

  return (
    <View
      style={[
        styles.meter,
        {
          backgroundColor: theme.dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.55)",
          borderColor: theme.border,
        },
      ]}
      accessibilityRole="progressbar"
      accessible
      accessibilityValue={{ min: 0, max: goal, now: kept % goal }}
      testID="kept-meter"
    >
      <Ionicons name="heart" size={15} color={theme.accent} />
      <Text style={[styles.meterText, { color: theme.ink }]}>
        {kept % goal}/{goal}
      </Text>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={[styles.fill, { width: `${filled * 100}%`, backgroundColor: theme.accent }]}
        />
      </View>
    </View>
  );
};

const FloatingChrome = ({
  kept = 0,
  goal = 5,
  onProfile,
  onPremium,
  onCategories,
  onPractice,
  onThemes,
  entitled = false,
}) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    /**
     * A plain View with the insets applied by hand, NOT a SafeAreaView.
     *
     * `pointerEvents` is the load-bearing prop here: this overlay covers the
     * whole screen, so anything it swallows is a gesture the affirmation
     * underneath never receives. SafeAreaView does not reliably forward
     * `pointerEvents` to its native view, and when it does not, the result is a
     * screen that renders perfectly and cannot be scrolled at all — which is
     * exactly what happened. `useSafeAreaInsets` gives the same spacing with no
     * wrapper to lose the prop.
     */
    <View
      style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      pointerEvents="box-none"
    >
      <View style={styles.row} pointerEvents="box-none">
        <Pill
          icon="person-outline"
          onPress={onProfile}
          accessibilityLabel={t("tabs.profile")}
          testID="chrome-profile"
          theme={theme}
        />

        <KeptMeter kept={kept} goal={goal} theme={theme} />

        <Pill
          icon={entitled ? "diamond" : "diamond-outline"}
          onPress={onPremium}
          accessibilityLabel={t("billing.title")}
          testID="chrome-premium"
          theme={theme}
        />
      </View>

      <View style={styles.row} pointerEvents="box-none">
        <Pill
          icon="heart-outline"
          label={t("tabs.favorites")}
          onPress={onCategories}
          testID="chrome-categories"
          theme={theme}
          wide
        />
        <Pill
          icon="flower-outline"
          label={t("tabs.practice")}
          onPress={onPractice}
          testID="chrome-practice"
          theme={theme}
          wide
        />
        <Pill
          icon="color-palette-outline"
          onPress={onThemes}
          accessibilityLabel={t("profile.theme")}
          testID="chrome-themes"
          theme={theme}
        />
      </View>
    </View>
  );
};

export default FloatingChrome;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  pill: {
    height: 46,
    minWidth: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  pillWide: { paddingHorizontal: spacing.lg },
  pillText: { fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.7 },
  meter: {
    flex: 1,
    height: 40,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  meterText: { fontSize: 13, fontWeight: "700" },
  track: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    marginLeft: spacing.xs,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill },
});
