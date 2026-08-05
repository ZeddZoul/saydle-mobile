import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Button from "../../components/Button";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useFeed } from "../../hooks/useFeed.js";
import { usePractice } from "../../hooks/usePractice.js";
import { useT } from "../../lib/i18n.js";
import { radius, spacing, type } from "../../theme/tokens.js";

/**
 * Practice: say today's line to yourself, a few times, on purpose.
 *
 * The whole screen is one tap target. No buttons to aim at, no counter to read
 * mid-thought — you say the words, you tap, and the dots fill. Anything more
 * would be something to operate rather than something to do.
 *
 * There is deliberately no timer and no way to go past the target: this is a
 * ritual with an end, not a score to maximise.
 */
const Practice = () => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const { todayEntry, loading } = useFeed();

  const affirmation = todayEntry?.affirmation;
  const { session, complete, streak, rep, reset } = usePractice(affirmation);

  // Each tap presses the words in slightly, like saying them lands somewhere.
  const press = useRef(new Animated.Value(1)).current;
  const done = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!complete) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.timing(done, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [complete, done]);

  const onTap = () => {
    if (complete) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    press.setValue(0.97);
    Animated.spring(press, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 10,
    }).start();

    rep();
  };

  if (loading || !affirmation) {
    return (
      <GradientBackground style={styles.centered}>
        <Text style={[styles.hint, { color: theme.sub }]}>
          {loading ? t("practice.loading") : t("practice.nothing")}
        </Text>
      </GradientBackground>
    );
  }

  const target = session?.target ?? 0;
  const count = session?.count ?? 0;

  return (
    <GradientBackground>
      <Pressable
        onPress={onTap}
        disabled={complete}
        accessibilityRole="button"
        accessibilityLabel={t("practice.tapLabel", { count, target })}
        accessibilityHint={complete ? undefined : t("practice.tapHint")}
        style={styles.surface}
        testID="practice-surface"
      >
        <Text style={[styles.eyebrow, { color: theme.sub }]}>
          {complete
            ? t("practice.doneEyebrow")
            : t("practice.eyebrow", { count, target })}
        </Text>

        <Animated.View style={{ transform: [{ scale: press }] }}>
          <DisplayText style={[styles.affirmation, { color: theme.ink }]}>
            {affirmation.text}
          </DisplayText>
        </Animated.View>

        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
          {Array.from({ length: target }).map((_, index) => (
            <View
              key={index}
              testID={index < count ? "practice-dot-filled" : "practice-dot"}
              style={[
                styles.dot,
                { borderColor: theme.border },
                index < count && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            />
          ))}
        </View>

        {complete ? (
          <Animated.View style={[styles.done, { opacity: done }]} testID="practice-done">
            <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
            <Text style={[styles.doneText, { color: theme.ink }]}>
              {user?.firstName
                ? t("practice.doneNamed", { name: user.firstName })
                : t("practice.done")}
            </Text>
            {streak > 1 ? (
              <Text style={[styles.hint, { color: theme.sub }]}>
                {t("practice.streak", { count: streak })}
              </Text>
            ) : null}
            <Button title={t("practice.again")} variant="secondary" onPress={reset} />
          </Animated.View>
        ) : (
          <Text style={[styles.hint, { color: theme.sub }]}>{t("practice.instruction")}</Text>
        )}
      </Pressable>
    </GradientBackground>
  );
};

export default Practice;

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  surface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: 88,
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: spacing.xl,
  },
  affirmation: {
    ...type.affirmation,
  },
  dots: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  done: {
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  doneText: {
    ...type.subtitle,
    textAlign: "center",
  },
  hint: {
    ...type.subtitle,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
