import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Button from "../../components/Button.jsx";
import Spacer from "../../components/Spacer.jsx";
import DeleteAccountSheet from "../../components/DeleteAccountSheet.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSubscription } from "../../hooks/useSubscription.js";
import { monthlyEquivalent } from "../../lib/purchases.js";
import { useT } from "../../lib/i18n.js";
import { PRIVACY_URL, TERMS_URL, DELETION_GRACE_DAYS } from "../../lib/config.js";
import { radius, spacing, type } from "../../theme/tokens.js";

const SUPPORT_MAILTO = "mailto:support@saydle.com";

/** The same three promises the first paywall makes, shown when we have no proof. */
const PERK_KEYS = ["paywall.perk1", "paywall.perk2", "paywall.perk3"];

/**
 * What an account that has not paid sees, and the only thing it sees.
 *
 * The paywall is hard: the route guard sends every other screen here, so this
 * page has to do four jobs at once rather than being a tab among tabs.
 *
 *   1. Sell. It leads with the argument and, where there is one, the line
 *      Saydle actually wrote for this person at signup — proof rather than
 *      promise, and the only thing on the screen that cannot be claimed by a
 *      competitor.
 *   2. Let them buy, and let them restore. Restore is required by Apple
 *      wherever a subscription is sold, and it is how someone who reinstalled
 *      gets back what they already paid for.
 *   3. Show the terms. Required beside a subscription CTA (App Review 3.1.2).
 *   4. Let them leave. Sign out and delete account are on this page rather
 *      than on Profile because Profile is behind the same gate: account
 *      deletion has to be reachable inside the app (guideline 5.1.1(v)) and the
 *      privacy policy promises it, so a paywall in front of it would be a
 *      rejection and a broken promise at once.
 *
 * Deliberately not billing.jsx with a branch. That screen is an account page —
 * "You're on the free plan", "Manage or cancel" with nothing to manage, a back
 * button to a screen this reader cannot reach. Every one of those is wrong
 * here, and the two pages disagree about what they are for.
 */
const LockedScreen = () => {
  const { user, signOut, deleteAccount } = useAuth();
  const { theme } = useAppTheme();
  const { t } = useT();
  const toast = useToast();

  const { subscription, packages, canPurchase, busy, purchase, restore, refresh } =
    useSubscription();

  const [deleting, setDeleting] = useState(false);

  const onPurchase = async (pkg) => {
    const result = await purchase(pkg);
    if (!result || result.cancelled) return;
    if (result.failed) return toast.error(t("billing.purchaseFailed"));
    toast.success(t(result.settled ? "billing.purchased" : "billing.purchaseSyncing"));
  };

  const onRestore = async () => {
    try {
      const result = await restore();
      if (!result?.available) return toast.info(t("billing.restoreUnavailable"));
      if (result.error) return toast.error(t("billing.restoreFailed"));
      if (!result.entitled) return toast.info(t("billing.restoreNothing"));

      const fresh = await refresh();
      toast.success(fresh?.entitled ? t("billing.restored") : t("billing.restoreSyncing"));
    } catch {
      toast.error(t("billing.restoreFailed"));
    }
  };

  const open = (url) => Linking.openURL(url).catch(() => {});

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <DisplayText weight="bold" style={[styles.title, { color: theme.ink }]}>
            {t("locked.title")}
          </DisplayText>

          <Text style={[styles.body, { color: theme.sub }]}>{t("locked.body")}</Text>

          {/* Proof where we have it, promise where we do not — never a claim we
              cannot back. The card is captioned "here's one Saydle wrote for
              you", so it may only ever hold a line the model actually wrote for
              this account. When generation never landed there is nothing
              truthful to put in it, and the three promises the first paywall
              makes are the honest substitute: they are what a subscription
              will do, stated as future tense rather than dressed as evidence. */}
          {subscription?.sampleLine ? (
            <View style={[styles.sample, { borderColor: theme.border }]}>
              <Text style={[styles.eyebrow, { color: theme.accent }]}>
                {t("billing.sampleEyebrow")}
              </Text>
              <DisplayText style={[styles.sampleText, { color: theme.ink }]}>
                {subscription.sampleLine}
              </DisplayText>
              <Text style={[styles.hint, { color: theme.sub }]}>
                {t("billing.sampleFooter")}
              </Text>
            </View>
          ) : (
            <View style={styles.perks}>
              {PERK_KEYS.map((key) => (
                <View key={key} style={styles.perk}>
                  <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  <Text style={[styles.perkText, { color: theme.ink }]}>{t(key)}</Text>
                </View>
              ))}
            </View>
          )}

          <Spacer height={spacing.lg} />

          {/* Hidden rather than disabled when there is nothing to sell: a
              button that cannot complete is worse than no button. */}
          {canPurchase && packages.length > 0 ? (
            <>
              {packages.map((pkg) => {
                const annual = pkg.packageType === "ANNUAL";
                const per = monthlyEquivalent(pkg);

                return (
                  <View key={pkg.identifier} style={styles.planWrap}>
                    <Button
                      title={`${pkg.product?.title ?? pkg.identifier} — ${
                        pkg.product?.priceString ?? ""
                      }`}
                      variant={annual ? "primary" : "secondary"}
                      disabled={busy}
                      onPress={() => onPurchase(pkg)}
                    />
                    {per ? (
                      <Text style={[styles.perMonth, { color: theme.sub }]}>
                        {t("paywall.perMonth", { price: per })}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={[styles.hint, { color: theme.sub }]}>
              {t("billing.storeUnavailable")}
            </Text>
          )}

          <Text style={[styles.cancelAnytime, { color: theme.sub }]}>{t("paywall.price")}</Text>

          {/* Required beside a subscription CTA, and the decent thing anyway. */}
          <View style={styles.legal}>
            <Pressable onPress={() => open(TERMS_URL)} accessibilityRole="link" hitSlop={8}>
              <Text style={[styles.legalLink, { color: theme.sub }]}>{t("legal.terms")}</Text>
            </Pressable>
            <Text style={[styles.legalDot, { color: theme.sub }]}>·</Text>
            <Pressable onPress={() => open(PRIVACY_URL)} accessibilityRole="link" hitSlop={8}>
              <Text style={[styles.legalLink, { color: theme.sub }]}>{t("legal.privacy")}</Text>
            </Pressable>
          </View>

          <Spacer height={spacing.lg} />

          <Button
            title={t("billing.restore")}
            variant="secondary"
            disabled={busy}
            onPress={onRestore}
          />

          <View style={[styles.rule, { backgroundColor: theme.border }]} />

          <Text style={[styles.hint, { color: theme.sub }]}>{t("locked.supportHint")}</Text>
          <Pressable onPress={() => open(SUPPORT_MAILTO)} accessibilityRole="link" hitSlop={8}>
            <Text style={[styles.supportLink, { color: theme.accent }]}>
              {t("locked.support")}
            </Text>
          </Pressable>

          <Spacer height={spacing.lg} />

          {/* The way out. Behind the same gate as everything else this would be
              a trap: someone signed in as the wrong person with no way back,
              and an account nobody can delete. */}
          {user?.email ? (
            <Text style={[styles.signedIn, { color: theme.sub }]}>
              {t("locked.signedInAs", { email: user.email })}
            </Text>
          ) : null}

          <Button title={t("profile.signOut")} variant="secondary" onPress={signOut} />

          <Pressable
            onPress={() => setDeleting(true)}
            accessibilityRole="button"
            style={styles.deleteButton}
            testID="locked-delete"
          >
            <Text style={styles.deleteText}>{t("profile.deleteAccount")}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <DeleteAccountSheet
        visible={deleting}
        email={user?.email}
        graceDays={DELETION_GRACE_DAYS}
        onClose={() => setDeleting(false)}
        onConfirm={deleteAccount}
      />
    </GradientBackground>
  );
};

export default LockedScreen;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  title: { ...type.screenTitle, textAlign: "center" },
  body: { ...type.body, textAlign: "center", marginTop: spacing.sm },
  sample: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  eyebrow: {
    ...type.label,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  sampleText: { ...type.sectionTitle, fontSize: 22, marginTop: spacing.xs },
  hint: { ...type.body, fontSize: 13, marginTop: spacing.xs, textAlign: "center" },
  perks: {
    // width:100% so each row has a defined width — without it the flex:1 label
    // collapses to zero and only the checkmark shows.
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  perk: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  perkText: { ...type.body, flex: 1 },
  planWrap: { marginBottom: spacing.sm },
  perMonth: { ...type.body, fontSize: 13, textAlign: "center", marginTop: spacing.xs },
  cancelAnytime: { ...type.body, fontSize: 12, textAlign: "center", marginTop: spacing.md },
  legal: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  legalLink: { ...type.body, fontSize: 12, textDecorationLine: "underline" },
  legalDot: { ...type.body, fontSize: 12, paddingHorizontal: spacing.xs },
  rule: { height: 1, marginVertical: spacing.xl, opacity: 0.6 },
  supportLink: {
    ...type.body,
    fontSize: 13,
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: spacing.xs,
  },
  signedIn: { ...type.body, fontSize: 13, textAlign: "center", marginBottom: spacing.sm },
  deleteButton: { alignItems: "center", marginTop: spacing.lg },
  deleteText: { ...type.body, fontSize: 13, color: "#B3261E" },
});
