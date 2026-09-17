import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import { messageFor } from "../lib/errors.js";
import { useT } from "../lib/i18n.js";
import { colors, radius, shadow, spacing } from "../theme/tokens.js";

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

/**
 * "You asked us to delete this — keep it?"
 *
 * Signing back in during the grace period does not cancel a deletion on its
 * own; it only makes cancelling *reachable*. This card is the cancel. It sits on
 * Today because that is the first screen after sign-in, and it can be put away
 * for the session — but only for the session. It is back on the next launch
 * until the account is actually restored, because a countdown someone dismissed
 * once and forgot about is exactly how an account gets purged by accident.
 */
const DeletionPendingCard = ({ style }) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const { deletion, keepAccount } = useAuth();
  const toast = useToast();

  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!deletion?.pending || dismissed) return null;

  const onKeep = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await keepAccount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(t("deletion.kept"));
    } catch (err) {
      toast.error(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const date = formatDate(deletion.purgeAfter);

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface }, style]}
      testID="deletion-pending-card"
    >
      <View style={styles.header}>
        <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
        <Text style={styles.eyebrow}>{t("deletion.eyebrow")}</Text>
      </View>

      <DisplayText style={[styles.title, { color: theme.ink }]}>
        {date ? t("deletion.scheduled", { date }) : t("deletion.scheduledSoon")}
      </DisplayText>
      <Text style={[styles.body, { color: theme.sub }]}>{t("deletion.body")}</Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => setDismissed(true)}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.later}
          testID="deletion-dismiss"
        >
          <Text style={[styles.laterText, { color: theme.sub }]}>{t("deletion.notNow")}</Text>
        </Pressable>

        <Pressable
          onPress={onKeep}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          style={[styles.keep, { backgroundColor: theme.accent }, busy && styles.keepBusy]}
          testID="deletion-keep"
        >
          <Text style={styles.keepText}>{t("deletion.keep")}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default DeletionPendingCard;

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: radius.xl,
    padding: spacing.lg,
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
    color: colors.danger,
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  later: { paddingVertical: spacing.sm },
  laterText: { fontSize: 14 },
  keep: {
    marginLeft: "auto",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  keepBusy: { opacity: 0.45 },
  keepText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
