import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../GradientBackground.jsx";
import DisplayText from "../DisplayText.jsx";
import Button from "../Button.jsx";
import OptionRow from "./OptionRow.jsx";
import ReminderSetup from "./ReminderSetup.jsx";
import StreakPreview from "./StreakPreview.jsx";
import BenefitsPanel from "./BenefitsPanel.jsx";
import ThemePicker from "../ThemePicker.jsx";
import { DEFAULT_THEME } from "../../theme/themes.js";
import { requestPermission } from "../../lib/notifications.js";
import { DEFAULT_REMINDER_WINDOW } from "../../lib/reminders.js";
import { validateEmail, PASSWORD_MIN } from "../../lib/validation.js";
import { colors, radius, shadow, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

// Auto-advance is quick but not instant, so a mis-tap can be corrected and the
// selection is visible before the page turns.
const ADVANCE_DELAY = 240;

// Reflective free-text answers: a soft, growing textarea with a gentle counter.
const TEXTAREA_MAX = 250;
const TEXTAREA_MIN_HEIGHT = 116;
const TEXTAREA_MAX_HEIGHT = 220;

/**
 * One onboarding page. Renders single / multi / text from the question config.
 *
 * Deliberately shows NO progress bar or step count — the flow's length stays a
 * mystery so people don't bail when they see how many remain. A single-select
 * answer auto-advances; multi and text use the Continue button.
 *
 * Controlled: the parent owns `value` and advances on `onNext`.
 */
const OnboardingStep = ({ question, value, onChange, onNext, onBack, onSkip, isFirst }) => {
  const { t, tf } = useT();
  const enter = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState(TEXTAREA_MIN_HEIGHT);

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, question.key]);

  const selectSingle = (optionValue) => {
    onChange(optionValue);
    setTimeout(onNext, ADVANCE_DELAY);
  };

  const toggleMulti = (optionValue) => {
    const current = Array.isArray(value) ? value : [];
    onChange(
      current.includes(optionValue)
        ? current.filter((v) => v !== optionValue)
        : [...current, optionValue],
    );
  };

  const isText = question.kind === "text";
  // A reflective free-text answer (not name/email/password) gets the soft,
  // growing textarea; the short fields keep the single-line pill.
  const isTextarea = isText && !question.inputType && question.key !== "callName";
  // Type-in and showcase steps center their content vertically, like a classic
  // multi-page onboarding; option lists stay top-aligned so long lists scroll.
  const centered = ["text", "info", "streak", "benefits"].includes(question.kind);

  // "Allow and Save" — the reminders step asks the OS right here, where the
  // value is on screen, rather than surprising them with a sheet later. It
  // also saves what the screen showed: someone who accepts the proposed
  // window without touching the slider has still chosen it, and the step used
  // to record nothing for them.
  const handleNext = async () => {
    if (question.kind === "reminders") {
      if (!value?.count) onChange({ ...DEFAULT_REMINDER_WINDOW });
      await requestPermission();
    }
    onNext();
  };
  // Guarded: for multi steps `value` is an array, so text checks must not run.
  const textValue = isText ? (value ?? "") : "";

  // Credential steps validate inline; other text just needs something typed.
  let textValid = false;
  if (isText) {
    if (question.inputType === "email") textValid = !validateEmail(textValue);
    else if (question.inputType === "password") textValid = textValue.length >= PASSWORD_MIN;
    else textValid = textValue.trim().length > 0;
  }

  // Question copy is translated by derived key, falling back to the English
  // already in the config — see lib/i18n.js `tf`.
  const qk = `questions.${question.key}`;
  const title = tf(`${qk}.title`, question.title);
  const subtitle = question.subtitle ? tf(`${qk}.subtitle`, question.subtitle) : null;
  const cta = question.cta ? tf(`${qk}.cta`, question.cta) : t("common.continue");
  const optionLabel = (opt) => tf(`${qk}.options.${opt.value}`, opt.label);

  const canContinue =
    question.kind === "multi"
      ? (value?.length ?? 0) > 0 || question.skippable
      : isText
        ? textValid || question.skippable
        : true;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          {isFirst ? (
            <View style={styles.headerButton} />
          ) : (
            <Pressable
              onPress={onBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              style={styles.headerButton}
            >
              <Ionicons name="chevron-back" size={26} color={colors.mauveDeep} />
            </Pressable>
          )}

          {question.skippable ? (
            <Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button">
              <Text style={styles.skip}>{t("common.skip")}</Text>
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <Animated.View
            style={[
              styles.flex,
              {
                opacity: enter,
                transform: [
                  {
                    translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
                  },
                ],
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={[styles.scroll, centered && styles.scrollCentered]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <DisplayText
                weight="bold"
                style={[styles.title, centered && styles.centeredText]}
              >
                {title}
              </DisplayText>
              {subtitle ? (
                <Text style={[styles.subtitle, centered && styles.centeredText]}>
                  {subtitle}
                </Text>
              ) : null}

              <View style={styles.body}>
                {question.kind === "single" &&
                  question.options.map((opt) => (
                    <OptionRow
                      key={String(opt.value)}
                      label={optionLabel(opt)}
                      selected={value === opt.value}
                      onPress={() => selectSingle(opt.value)}
                    />
                  ))}

                {question.kind === "multi" &&
                  question.options.map((opt) => (
                    <OptionRow
                      key={String(opt.value)}
                      label={optionLabel(opt)}
                      multi
                      selected={Array.isArray(value) && value.includes(opt.value)}
                      onPress={() => toggleMulti(opt.value)}
                    />
                  ))}

                {isTextarea && (
                  <View>
                    <TextInput
                      style={[
                        styles.textarea,
                        focused && styles.textareaFocused,
                        { height: textareaHeight },
                      ]}
                      placeholder={tf(`${qk}.placeholder`, question.placeholder)}
                      placeholderTextColor={colors.inkFaint}
                      selectionColor={colors.coral}
                      cursorColor={colors.coral}
                      value={textValue}
                      onChangeText={onChange}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      accessibilityLabel={title}
                      autoFocus
                      multiline
                      maxLength={TEXTAREA_MAX}
                      textAlignVertical="top"
                      autoCapitalize="sentences"
                      // Grow to fit the text, clamped so it never dominates the page.
                      onContentSizeChange={(e) =>
                        setTextareaHeight(
                          Math.min(
                            TEXTAREA_MAX_HEIGHT,
                            Math.max(
                              TEXTAREA_MIN_HEIGHT,
                              e.nativeEvent.contentSize.height + 24,
                            ),
                          ),
                        )
                      }
                    />
                    <Text
                      style={[
                        styles.counter,
                        textValue.length >= TEXTAREA_MAX * 0.9 && styles.counterNearLimit,
                      ]}
                    >
                      {textValue.length}/{TEXTAREA_MAX}
                    </Text>
                  </View>
                )}

                {question.kind === "reminders" && (
                  <ReminderSetup value={value} onChange={onChange} />
                )}

                {question.kind === "theme" && (
                  <ThemePicker value={value ?? DEFAULT_THEME} onChange={onChange} />
                )}

                {question.kind === "streak" && <StreakPreview />}

                {question.kind === "benefits" && <BenefitsPanel />}

                {isText && !isTextarea && (
                  <TextInput
                    style={[styles.input, focused && styles.inputFocused]}
                    placeholder={tf(`${qk}.placeholder`, question.placeholder)}
                    placeholderTextColor={colors.inkFaint}
                    selectionColor={colors.coral}
                    cursorColor={colors.coral}
                    value={textValue}
                    onChangeText={onChange}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    accessibilityLabel={title}
                    autoFocus
                    keyboardType={question.inputType === "email" ? "email-address" : "default"}
                    secureTextEntry={question.inputType === "password"}
                    autoCapitalize={question.inputType ? "none" : "words"}
                    autoComplete={
                      question.inputType === "email"
                        ? "email"
                        : question.inputType === "password"
                          ? "new-password"
                          : "off"
                    }
                    textContentType={
                      question.inputType === "email"
                        ? "emailAddress"
                        : question.inputType === "password"
                          ? "newPassword"
                          : "none"
                    }
                    returnKeyType={canContinue ? "next" : "default"}
                    onSubmitEditing={canContinue ? onNext : undefined}
                  />
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>

        {question.kind !== "single" ? (
          <View style={styles.footer}>
            <Button title={cta} onPress={handleNext} disabled={!canContinue} />
          </View>
        ) : null}
      </SafeAreaView>
    </GradientBackground>
  );
};

export default OnboardingStep;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    minHeight: 40,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 26,
    justifyContent: "center",
  },
  skip: {
    fontSize: 16,
    color: colors.mauveDeep,
    fontWeight: "600",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scrollCentered: {
    justifyContent: "center",
    paddingBottom: spacing.xxxl,
  },
  centeredText: {
    textAlign: "center",
  },
  title: {
    ...type.screenTitle,
    fontSize: 27,
    lineHeight: 34,
  },
  subtitle: {
    ...type.subtitle,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  body: {
    marginTop: spacing.md,
  },
  // Semi-transparent field — a soft, low-opacity panel with no hard border that
  // sits inside the gradient. Brightens slightly on focus. No stark box.
  input: {
    fontSize: 20,
    color: colors.ink,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.2)",
    ...shadow.soft,
  },
  inputFocused: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  textarea: {
    fontSize: 19,
    lineHeight: 27,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.2)",
    textAlignVertical: "top",
    ...shadow.soft,
  },
  textareaFocused: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  counter: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.inkFaint,
  },
  counterNearLimit: {
    color: colors.coral,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
});
