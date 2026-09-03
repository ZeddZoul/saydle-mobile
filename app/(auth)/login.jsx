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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import FormField from "../../components/FormField";
import Button from "../../components/Button";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { ApiError, messageFor } from "../../lib/errors.js";
import { validateLogin, hasErrors } from "../../lib/validation.js";
import { colors, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

const Login = () => {
  const { t } = useT();
  const router = useRouter();
  // `restore=1` is the paywall's "Restore purchases": there is no account to
  // attach a purchase to before sign-in, so the paywall sends people here and
  // this line says where the restore actually lives.
  const { restore } = useLocalSearchParams();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async () => {
    if (submitting) return;

    // Instant client-side check, so an obviously-bad email never costs a round
    // trip. The server still has the final say and its errors surface below.
    const clientErrors = validateLogin(form);
    if (hasErrors(clientErrors)) {
      setFieldErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await signIn(form);
      // The root guard redirects once auth state flips; nothing to do here.
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) {
        setFieldErrors(err.details);
      } else {
        setFormError(messageFor(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

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
                {t("auth.welcomeBack")}
              </DisplayText>
              <Text style={styles.subtitle}>{t("auth.welcomeSubtitle")}</Text>
              {restore ? (
                <Text style={styles.restoreHint} testID="login-restore-hint">
                  {t("auth.restoreHint")}
                </Text>
              ) : null}
            </View>

            <View style={styles.form}>
              <FormField
                label={t("auth.email")}
                icon="mail-outline"
                placeholder={t("auth.emailPlaceholder")}
                value={form.email}
                onChangeText={handleChange("email")}
                error={fieldErrors.email}
                autoCapitalize="none"
                // autoCapitalize alone does not hold: iOS autocorrect rewrites
                // the domain to uppercase on its own, which reads as the app
                // mangling what was typed. The server lowercases regardless, so
                // this is about what the reader sees, not what gets sent.
                autoCorrect={false}
                spellCheck={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!submitting}
              />

              <FormField
                label={t("auth.password")}
                icon="lock-closed-outline"
                placeholder={t("auth.passwordPlaceholder")}
                value={form.password}
                onChangeText={handleChange("password")}
                error={fieldErrors.password}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                editable={!submitting}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />

              <Pressable
                onPress={() => router.push("/forgot-password")}
                hitSlop={8}
                style={styles.forgot}
              >
                <Text style={styles.forgotText}>{t("auth.forgotLink")}</Text>
              </Pressable>

              {formError ? (
                <Text style={styles.formError} accessibilityRole="alert">
                  {formError}
                </Text>
              ) : null}

              <Button
                title={t("auth.logIn")}
                onPress={handleSubmit}
                loading={submitting}
                style={styles.submit}
              />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t("auth.noAccount")}</Text>
              <Pressable onPress={() => router.replace("/onboarding")} hitSlop={8}>
                <Text style={styles.footerLink}>{t("auth.createOne")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
};

export default Login;

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
    maxWidth: 300,
  },
  restoreHint: {
    ...type.subtitle,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.md,
    maxWidth: 320,
    color: colors.coral,
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
  forgot: {
    alignSelf: "flex-end",
    marginBottom: spacing.md,
  },
  forgotText: {
    color: colors.mauveDeep,
    fontSize: 14,
    fontWeight: "600",
  },
  formError: {
    color: colors.danger,
    marginBottom: spacing.md,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  footerText: {
    ...type.subtitle,
  },
  footerLink: {
    color: colors.coral,
    fontWeight: "700",
    fontSize: 15,
  },
});
