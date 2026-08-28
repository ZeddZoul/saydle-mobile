import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import FormField from "../../components/FormField";
import Button from "../../components/Button";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ApiError, messageFor } from "../../lib/errors.js";
import { validateEmail, PASSWORD_MIN } from "../../lib/validation.js";
import { useT } from "../../lib/i18n.js";
import { colors, spacing, type } from "../../theme/tokens.js";

/**
 * Password reset, both steps on one screen.
 *
 * Requesting a code and entering it are separate phases rather than separate
 * routes: the code arrives seconds later while the user is still here, and a
 * route change would lose the email they just typed.
 */
const ForgotPassword = () => {
  const { t } = useT();
  const router = useRouter();
  const { client } = useAuth();
  const toast = useToast();

  const [phase, setPhase] = useState("request"); // request | reset
  const [form, setForm] = useState({ email: "", code: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const sendCode = async () => {
    if (submitting) return;

    const emailError = validateEmail(form.email);
    if (emailError) return setFieldErrors({ email: emailError });

    setSubmitting(true);
    setFormError(null);

    try {
      await client.forgotPassword(form.email.trim());
      // The API answers the same way whether or not the address exists, so this
      // screen must too — anything else would reveal who has an account.
      setPhase("reset");
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async () => {
    if (submitting) return;

    const errors = {};
    if (!form.code.trim()) errors.code = t("validation.codeRequired");
    else if (!/^\d{6}$/.test(form.code.trim())) errors.code = t("validation.codeInvalid");
    if (!form.password) errors.password = t("validation.passwordRequired");
    else if (form.password.length < PASSWORD_MIN) {
      errors.password = t("validation.passwordShort", { min: PASSWORD_MIN });
    }

    if (Object.keys(errors).length > 0) return setFieldErrors(errors);

    setSubmitting(true);
    setFormError(null);

    try {
      await client.resetPassword({
        email: form.email.trim(),
        code: form.code.trim(),
        password: form.password,
      });

      // No session is issued — signing in with the new password is the
      // confirmation that it took.
      toast.success(t("auth.resetDone"));
      router.replace("/login");
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) setFieldErrors(err.details);
      else setFormError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isRequest = phase === "request";

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <DisplayText weight="bold" style={styles.wordmark}>
                Saydle
              </DisplayText>
              <DisplayText weight="bold" style={styles.title}>
                {t(isRequest ? "auth.forgotTitle" : "auth.resetTitle")}
              </DisplayText>
              <Text style={styles.subtitle}>
                {isRequest
                  ? t("auth.forgotSubtitle")
                  : t("auth.resetSubtitle", { email: form.email.trim() })}
              </Text>
            </View>

            <View style={styles.form}>
              {isRequest ? (
                <FormField
                  label={t("auth.email")}
                  icon="mail-outline"
                  placeholder={t("auth.emailPlaceholder")}
                  value={form.email}
                  onChangeText={handleChange("email")}
                  error={fieldErrors.email}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!submitting}
                  onSubmitEditing={sendCode}
                  returnKeyType="go"
                />
              ) : (
                <>
                  <FormField
                    label={t("auth.code")}
                    icon="keypad-outline"
                    placeholder={t("auth.codePlaceholder")}
                    value={form.code}
                    onChangeText={handleChange("code")}
                    error={fieldErrors.code}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    editable={!submitting}
                  />

                  <FormField
                    label={t("auth.newPassword")}
                    icon="lock-closed-outline"
                    placeholder={t("auth.newPasswordPlaceholder")}
                    value={form.password}
                    onChangeText={handleChange("password")}
                    error={fieldErrors.password}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    editable={!submitting}
                    onSubmitEditing={submitReset}
                    returnKeyType="go"
                  />
                </>
              )}

              {formError ? (
                <Text style={styles.formError} accessibilityRole="alert">
                  {formError}
                </Text>
              ) : null}

              <Button
                title={t(isRequest ? "auth.forgotSend" : "auth.resetSubmit")}
                onPress={isRequest ? sendCode : submitReset}
                loading={submitting}
                style={styles.submit}
              />
            </View>

            <View style={styles.footer}>
              <Pressable onPress={() => router.replace("/login")} hitSlop={8}>
                <Text style={styles.footerLink}>{t("auth.backToLogin")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
};

export default ForgotPassword;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
  },
  wordmark: {
    fontSize: 26,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  title: {
    ...type.screenTitle,
    textAlign: "center",
  },
  subtitle: {
    ...type.subtitle,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  form: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    marginTop: spacing.md,
  },
  submit: {
    marginTop: spacing.md,
  },
  formError: {
    color: colors.danger,
    marginBottom: spacing.md,
    fontSize: 14,
  },
  footer: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  footerLink: {
    color: colors.coral,
    fontWeight: "700",
    fontSize: 15,
  },
});
