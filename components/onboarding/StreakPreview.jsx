import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DisplayText from "../DisplayText.jsx";
import FadeInView from "../FadeInView.jsx";
import Sparkles from "../Sparkles.jsx";
import { addDays, todayLocal, weekdayShort } from "../../lib/dates.js";
import { colors, radius, shadow, spacing } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

/** Monday-anchored week containing `today`, with today marked as earned. */
function previewWeek(today) {
  const [y, m, d] = today.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = addDays(today, -offset);

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, isToday: date === today, seen: date === today };
  });
}

/**
 * The "day one" moment: the streak they're about to start, shown before it
 * exists. The numeral springs in and the week dots cascade, so it reads as
 * something beginning rather than a static graphic.
 */
const StreakPreview = () => {
  const { t } = useT();
  const today = todayLocal();
  const week = previewWeek(today);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: true,
      speed: 12,
      bounciness: 14,
      delay: 120,
    });
    animation.start();
    return () => animation.stop();
  }, [pop]);

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Sparkles />
        <Animated.View
          style={{
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ],
            opacity: pop,
          }}
        >
          <DisplayText weight="bold" style={styles.numeral}>
            1
          </DisplayText>
        </Animated.View>
      </View>

      <FadeInView delay={320}>
        <View style={styles.card}>
          <View style={styles.week}>
            {week.map((day, index) => (
              <FadeInView key={day.date} delay={420 + index * 60} from={8} style={styles.day}>
                <Text style={[styles.weekday, day.isToday && styles.weekdayToday]}>
                  {weekdayShort(day.date).slice(0, 3)}
                </Text>
                <View style={[styles.dot, day.seen && styles.dotSeen]}>
                  {day.seen ? (
                    <Ionicons name="checkmark" size={13} color={colors.white} />
                  ) : null}
                </View>
              </FadeInView>
            ))}
          </View>
          <Text style={styles.caption}>{t("onboarding.streakCaption")}</Text>
        </View>
      </FadeInView>
    </View>
  );
};

export default StreakPreview;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xxl,
  },
  hero: {
    height: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  numeral: {
    fontSize: 108,
    lineHeight: 124,
    color: colors.coral,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
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
  caption: {
    marginTop: spacing.lg,
    fontSize: 14,
    color: colors.mauveDeep,
    textAlign: "center",
  },
});
