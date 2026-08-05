import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DisplayText from "./DisplayText.jsx";
import { weekdayShort } from "../lib/dates.js";
import { colors, radius, shadow, spacing } from "../theme/tokens.js";
import { useT } from "../lib/i18n.js";
import { useAppTheme } from "../contexts/ThemeContext.jsx";

/**
 * The week strip: a running count plus Monday–Sunday dots.
 *
 * A zero is deflating, so day one reads as an invitation ("Start your streak
 * today") rather than "0 days". Future days sit faded — present but not yet
 * earned.
 */
const StreakStrip = ({ streak }) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  if (!streak) return null;

  const { current, week = [] } = streak;
  const hasStreak = current > 0;

  return (
    <View style={[styles.card, theme.dark && styles.cardDark]}>
      <View style={styles.header}>
        {hasStreak ? (
          <>
            <DisplayText weight="bold" style={[styles.count, { color: theme.accent }]}>
              {current}
            </DisplayText>
            <Text style={[styles.label, { color: theme.sub }]}>
              {t(current === 1 ? "streak.dayOne" : "streak.days")}
            </Text>
          </>
        ) : (
          <Text style={[styles.label, { color: theme.sub }]}>{t("streak.start")}</Text>
        )}
      </View>

      <View style={styles.week}>
        {week.map((day) => (
          <View key={day.date} style={styles.day}>
            <Text
              style={[
                styles.weekday,
                { color: theme.sub },
                day.isToday && [styles.weekdayToday, { color: theme.accent }],
                day.isFuture && styles.dimmed,
              ]}
            >
              {weekdayShort(day.date).slice(0, 3)}
            </Text>

            <View
              style={[
                styles.dot,
                { borderColor: theme.sub },
                day.seen && [styles.dotSeen, { backgroundColor: theme.accent, borderColor: theme.accent }],
                day.isToday && !day.seen && { borderColor: theme.accent, borderWidth: 2 },
                day.isFuture && styles.dimmed,
              ]}
              accessibilityLabel={
                day.seen
                  ? t("streak.complete", { day: weekdayShort(day.date) })
                  : weekdayShort(day.date)
              }
            >
              {day.seen ? (
                <Ionicons name="checkmark" size={13} color={colors.white} />
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export default StreakStrip;

const styles = StyleSheet.create({
  cardDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  count: {
    fontSize: 26,
    color: colors.coral,
  },
  label: {
    fontSize: 14,
    color: colors.mauveDeep,
    fontWeight: "600",
  },
  week: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  day: {
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  weekday: {
    fontSize: 11,
    color: colors.mauveDeep,
  },
  weekdayToday: {
    fontWeight: "700",
    color: colors.coral,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.mauve,
    alignItems: "center",
    justifyContent: "center",
  },
  dotSeen: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  dotToday: {
    borderColor: colors.coral,
    borderWidth: 2,
  },
  dimmed: {
    opacity: 0.4,
  },
});
