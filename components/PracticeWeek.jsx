import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { addDays, weekdayShort } from "../lib/dates.js";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { radius, spacing, type } from "../theme/tokens.js";

/**
 * The last seven days of practice, ending today.
 *
 * Sixty days of this already sit in the cache and only the streak number was
 * ever surfaced, which tells you how long you've been perfect and nothing else.
 * Seven dots show the shape of a week instead — including the gaps, without
 * making them look like failures. A missed day is an unfilled circle, not a red
 * one, and today is outlined whether or not it's done yet.
 */
const PracticeWeek = ({ history = [], today }) => {
  const { theme } = useAppTheme();

  const done = new Set(history.filter((e) => e.completedAt).map((e) => e.date));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, label: weekdayShort(date), done: done.has(date), isToday: date === today };
  });

  return (
    <View style={styles.row} testID="practice-week">
      {days.map((day) => (
        <View key={day.date} style={styles.day}>
          <Text style={[styles.label, { color: theme.sub }]}>{day.label.slice(0, 2)}</Text>
          <View
            style={[
              styles.dot,
              { borderColor: day.isToday ? theme.accent : theme.border },
              day.done && { backgroundColor: theme.accent, borderColor: theme.accent },
            ]}
            // Same testID convention as the rep dots on the practice screen.
            testID={day.done ? "week-dot-done" : "week-dot"}
            accessible
            accessibilityLabel={day.label}
            accessibilityRole="image"
            accessibilityState={{ selected: day.done }}
          >
            {day.done ? <Ionicons name="checkmark" size={12} color={theme.surface} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
};

export default PracticeWeek;

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: spacing.md },
  day: { alignItems: "center", gap: 6 },
  label: { ...type.body, fontSize: 10, letterSpacing: 0.3 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    alignItems: "center",
    justifyContent: "center",
  },
});
