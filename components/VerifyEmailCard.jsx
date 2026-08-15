import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useEmailVerification } from "../hooks/useEmailVerification.js";
import { messageFor } from "../lib/errors.js";
import { useT } from "../lib/i18n.js";
import { colors, radius, shadow, spacing, type } from "../theme/tokens.js";

const CODE_LENGTH = 6;

/**
 * "Confirm your email" — a card, not a wall.
 *
 * Verification is not a precondition for anything: it exists so a forgotten
 * password has somewhere real to go. Blocking the affirmations someone just
 * signed up for behind an inbox round trip would cost far more than it protects,
 * so this can be dismissed and simply doesn't come back this session.
 *
 * It disappears on its own the moment the account is verified, including from
 * another device — `/me` is the authority, not local state.
 */
const VerifyEmailCard = ({ style }) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const { verified, email, sending, verifying, sent, error, resend, verify } =
    useEmailVerification();

  const [code, setCode] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState(false);

  // `done` is checked before `verified` on purpose: verifying flips the account
  // to verified, which would otherwise make the card vanish mid-tap. Someone who
  // just typed a code should be told it worked.
  if (!done && (verified || dismissed)) return null;

  const onSubmit = async () => {
    if (code.length !== CODE_LENGTH) return;

    const ok = await verify(code);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(true);
    } else {
      setCode("");
    }
  };

  if (done) {
    return (
      <View
        style={[styles.card, styles.doneCard, { backgroundColor: theme.surface }, style]}
        testID="verify-email-done"
      >
        <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
        <Text style={[styles.doneText, { color: theme.ink }]}>{t("verify.done")}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface }, style]}
      testID="verify-email-card"
    >
      <View style={styles.header}>
        <Ionicons name="mail-outline" size={15} color={theme.accent} />
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{t("verify.eyebrow")}</Text>
      </View>

      {/* Interpolating an address we do not have reads as a typo — "Is  right?"
          — rather than as missing data, and it is the first card a new account
          sees. Wherever the address is genuinely unknown the copy simply stops
          naming it. */}
      <DisplayText style={[styles.title, { color: theme.ink }]}>
        {email ? t("verify.title", { email }) : t("verify.titleAnonymous")}
      </DisplayText>
      <Text style={[styles.body, { color: theme.sub }]}>
        {sent && email
          ? t("verify.resent", { email })
          : email
            ? t("verify.body", { email })
            : t("verify.bodyAnonymous")}
      </Text>

      <TextInput
        value={code}
        onChangeText={(next) => setCode(next.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        editable={!verifying}
        placeholder={t("verify.codePlaceholder")}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={t("verify.code")}
        style={[styles.input, { color: theme.ink }]}
      />

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {messageFor(error)}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => setDismissed(true)}
          disabled={verifying}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.later}
        >
          <Text style={[styles.laterText, { color: theme.sub }]}>{t("verify.later")}</Text>
        </Pressable>

        <Pressable
          onPress={resend}
          disabled={sending || verifying}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.later}
        >
          <Text style={[styles.laterText, { color: theme.accent }]}>{t("verify.resend")}</Text>
        </Pressable>

        <Pressable
          onPress={onSubmit}
          disabled={verifying || code.length !== CODE_LENGTH}
          accessibilityRole="button"
          accessibilityState={{ disabled: verifying || code.length !== CODE_LENGTH }}
          style={[
            styles.submit,
            { backgroundColor: theme.accent },
            (verifying || code.length !== CODE_LENGTH) && styles.submitDisabled,
          ]}
        >
          <Text style={styles.submitText}>{t("verify.submit")}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default VerifyEmailCard;

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.soft,
  },
  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  doneText: {
    ...type.subtitle,
    flex: 1,
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
  title: {
    fontSize: 19,
    lineHeight: 26,
    marginTop: spacing.sm,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  input: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  later: {
    paddingVertical: spacing.sm,
  },
  laterText: {
    fontSize: 14,
  },
  submit: {
    marginLeft: "auto",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: spacing.md,
  },
});
