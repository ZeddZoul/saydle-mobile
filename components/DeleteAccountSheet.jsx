import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DisplayText from "./DisplayText.jsx";
import FormField from "./FormField.jsx";
import Button from "./Button.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useT } from "../lib/i18n.js";
import { messageFor } from "../lib/errors.js";
import { colors, radius, spacing, type } from "../theme/tokens.js";

/**
 * Two locks on the door out.
 *
 * The password proves it is them — a borrowed unlocked phone should not be able
 * to end someone's account. Typing the address back proves they meant it, which
 * a destructive button alone cannot: tapping is reflex, transcription is not.
 *
 * Deliberately not an `Alert`. The system dialog cannot take two fields, and it
 * also cannot say the one thing this screen most needs to say — that nothing is
 * destroyed today and signing back in undoes it.
 */
const DeleteAccountSheet = ({ visible, email, graceDays, onClose, onConfirm }) => {
  const { t } = useT();
  const { theme } = useAppTheme();

  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Compared the way the server compares it, so the button never enables on
  // something the API will then reject.
  const matches = confirmEmail.trim().toLowerCase() === (email ?? "").toLowerCase();
  const ready = matches && password.length > 0 && !busy;

  const close = () => {
    setPassword("");
    setConfirmEmail("");
    setError(null);
    onClose?.();
  };

  const submit = async () => {
    if (!ready) return;

    setBusy(true);
    setError(null);

    try {
      await onConfirm({ password, confirmEmail: confirmEmail.trim() });
      close();
    } catch (err) {
      setError(err);
      // Only the password is cleared: making them retype the address after a
      // wrong password would read as punishment.
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const details = error?.details ?? {};

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View
        style={[styles.sheet, { backgroundColor: theme.gradient[0] }]}
        testID="delete-sheet"
      >
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <DisplayText style={[styles.title, { color: theme.ink }]}>
              {t("profile.deleteTitle")}
            </DisplayText>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t("profile.cancel")}
              hitSlop={10}
              testID="delete-close"
            >
              <Ionicons name="close" size={24} color={theme.sub} />
            </Pressable>
          </View>

          <Text style={[styles.body, { color: theme.sub }]}>
            {t("profile.deleteBody", { days: graceDays })}
          </Text>

          {/* Deleting the account does not cancel the store subscription, and
              someone who assumes it does keeps getting charged. */}
          <View style={[styles.notice, { borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.sub} />
            <Text style={[styles.noticeText, { color: theme.sub }]}>
              {t("profile.deleteBillingNotice")}
            </Text>
          </View>

          <FormField
            label={t("profile.deletePasswordLabel")}
            icon="lock-closed-outline"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            error={details.password}
            testID="delete-password"
          />

          <FormField
            label={t("profile.deleteConfirmLabel", { email })}
            icon="mail-outline"
            value={confirmEmail}
            onChangeText={setConfirmEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={email}
            error={details.confirmEmail}
            testID="delete-confirm"
          />

          {error && !details.password && !details.confirmEmail ? (
            <Text style={styles.error} accessibilityRole="alert">
              {messageFor(error)}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {busy ? (
              <ActivityIndicator color={theme.accent} testID="delete-busy" />
            ) : (
              <Button
                title={t("profile.deleteSubmit")}
                onPress={submit}
                disabled={!ready}
                testID="delete-submit"
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default DeleteAccountSheet;

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.md,
  },
  title: { ...type.sectionTitle, fontSize: 22 },
  body: { fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.lg,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  actions: { marginTop: spacing.lg },
});
