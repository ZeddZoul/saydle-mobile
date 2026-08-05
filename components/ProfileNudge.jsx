import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import CompletenessMeter from "./CompletenessMeter.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { questionFor } from "../lib/onboardingQuestions.js";
import { messageFor } from "../lib/errors.js";
import { useT } from "../lib/i18n.js";
import { colors, radius, shadow, spacing, type } from "../theme/tokens.js";

const TEXT_MAX = 250;

/** "personal-growth" → "Personal growth", for any field the funnel never asked. */
const slugToLabel = (slug) => {
  const words = String(slug).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * One more question, asked once in a long while, on the Today screen.
 *
 * The question is borrowed verbatim from the onboarding funnel where that field
 * appears there, so a field is never asked two different ways — and the existing
 * `questions.*` translations cover it for free.
 *
 * Answering happens in place. The card exists precisely because the alternative
 * — "go to Profile and fill in more" — is a chore nobody does.
 */
const ProfileNudge = ({ suggestion, completeness, onAnswer, onDismiss, style }) => {
  const { t, tf } = useT();
  const { theme } = useAppTheme();

  const [multi, setMulti] = useState([]);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset when a different question arrives, so a half-typed answer to the
    // last one can't be submitted against this one.
    setMulti([]);
    setText("");
    setError(null);
    setDone(false);

    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [suggestion?.key, enter]);

  if (!suggestion) return null;

  const question = questionFor(suggestion.key);
  const qk = `questions.${suggestion.key}`;
  const title = tf(`${qk}.title`, question?.title ?? suggestion.label);

  // Prefer the funnel's human labels; fall back to the raw slugs the API sends.
  const options = (question?.options ?? []).length
    ? question.options
    : (suggestion.options ?? []).map((value) => ({ value, label: slugToLabel(value) }));

  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  const submit = async (value) => {
    setSaving(true);
    setError(null);
    try {
      await onAnswer(suggestion.key, value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(true);
    } catch (err) {
      // Saving needs the network — the answer changes what tomorrow is generated
      // from, so we say it didn't land rather than quietly dropping it.
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleMulti = (value) => {
    Haptics.selectionAsync().catch(() => {});
    setMulti((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  };

  const canSave =
    suggestion.kind === "multi" ? multi.length > 0 : text.trim().length > 0;

  if (done) {
    return (
      <Animated.View
        style={[styles.card, styles.thanks, { backgroundColor: theme.surface }, style]}
        testID="nudge-thanks"
      >
        <Ionicons name="sparkles" size={18} color={theme.accent} />
        <Text style={[styles.thanksText, { color: theme.ink }]}>{t("nudge.thanks")}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: theme.surface, opacity: enter, transform: [{ translateY: rise }] },
        style,
      ]}
      testID="profile-nudge"
    >
      <View style={styles.header}>
        <Ionicons name="sparkles-outline" size={15} color={theme.accent} />
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{t("nudge.eyebrow")}</Text>
      </View>

      {completeness ? (
        <CompletenessMeter percent={completeness.percent} style={styles.meter} />
      ) : null}

      <DisplayText style={[styles.title, { color: theme.ink }]}>{title}</DisplayText>

      {suggestion.kind === "text" ? (
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          maxLength={TEXT_MAX}
          editable={!saving}
          placeholder={tf(`${qk}.placeholder`, question?.placeholder ?? t("nudge.placeholder"))}
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={title}
          style={[
            styles.input,
            { color: theme.ink },
            focused && styles.inputFocused,
          ]}
        />
      ) : (
        <View style={styles.options}>
          {options.map((option) => {
            const selected =
              suggestion.kind === "multi" && multi.includes(option.value);

            return (
              <Pressable
                key={option.value}
                disabled={saving}
                onPress={() =>
                  suggestion.kind === "multi"
                    ? toggleMulti(option.value)
                    : submit(option.value)
                }
                accessibilityRole={suggestion.kind === "multi" ? "checkbox" : "radio"}
                accessibilityState={{ selected, checked: selected, disabled: saving }}
                style={[
                  styles.pill,
                  { borderColor: theme.border, backgroundColor: theme.surfaceStrong },
                  selected && { borderColor: theme.accent, backgroundColor: theme.accent },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: theme.ink },
                    selected && styles.pillTextSelected,
                  ]}
                >
                  {tf(`${qk}.options.${option.value}`, option.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {messageFor(error)}
        </Text>
      ) : null}

      <View style={[styles.footer, !onDismiss && styles.footerEnd]}>
        {/* No "not now" where the card was sought out rather than offered. */}
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            disabled={saving}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.dismiss}
          >
            <Text style={[styles.dismissText, { color: theme.sub }]}>{t("nudge.notNow")}</Text>
          </Pressable>
        ) : null}

        {/* Single-select saves on tap, so it needs no button of its own. */}
        {suggestion.kind === "single" ? null : (
          <Pressable
            onPress={() => submit(suggestion.kind === "multi" ? multi : text.trim())}
            disabled={saving || !canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !canSave }}
            style={[
              styles.save,
              { backgroundColor: theme.accent },
              (saving || !canSave) && styles.saveDisabled,
            ]}
          >
            <Text style={styles.saveText}>{t("nudge.save")}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
};

export default ProfileNudge;

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.xxl,
    ...shadow.soft,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  meter: {
    marginTop: spacing.md,
  },
  title: {
    fontSize: 19,
    lineHeight: 26,
    marginTop: spacing.md,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
  },
  pillTextSelected: {
    color: colors.white,
  },
  input: {
    fontSize: 16,
    lineHeight: 23,
    minHeight: 84,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.2)",
    textAlignVertical: "top",
  },
  inputFocused: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  footerEnd: {
    justifyContent: "flex-end",
  },
  dismiss: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  dismissText: {
    fontSize: 14,
  },
  save: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  saveDisabled: {
    opacity: 0.45,
  },
  saveText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  thanks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  thanksText: {
    ...type.subtitle,
    flex: 1,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: spacing.md,
  },
});
