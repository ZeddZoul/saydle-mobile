import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GradientBackground from "../../components/GradientBackground.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Button from "../../components/Button";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import TrialTimeline from "../../components/TrialTimeline.jsx";
import { useSubscription } from "../../hooks/useSubscription.js";
import { TRIAL_DAYS } from "../../lib/config.js";
import { useT } from "../../lib/i18n.js";
import { radius, spacing, type } from "../../theme/tokens.js";

/**
 * What you're paying, until when, and how to change it.
 *
 * The diamond in the floating chrome used to open the library, which answered a
 * different question entirely. This screen exists so "am I subscribed, when does
 * it renew, how do I cancel" has somewhere to be answered.
 *
 * Cancelling is not something an app can do: on both stores the subscription
 * belongs to the store account, so the honest move is to send people to the
 * place that can actually change it rather than pretending to handle it here.
 */
const STORE_SUBSCRIPTIONS = Platform.select({
  ios: "itms-apps://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: "https://play.google.com/store/account/subscriptions",
});

/**
 * The same destination over https, used when the scheme above has no handler.
 *
 * `itms-apps://` is what opens the App Store app on real hardware, but the
 * Simulator has no App Store, so nothing claims the scheme and `openURL`
 * rejects. Without a fallback that surfaces as "Couldn't open the store" for a
 * link which is perfectly fine on a device — an error that sends you looking
 * for a bug in code that has none.
 */
const STORE_SUBSCRIPTIONS_WEB = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
  default: "https://play.google.com/store/account/subscriptions",
});

/**
 * Where a refund is actually requested.
 *
 * Apple's is a real self-serve flow; Google's is the order history, which is
 * the nearest equivalent it offers. Both belong to the store, not to us — we
 * only ever hand someone to the place that can act.
 */
const REFUND_URL = Platform.select({
  ios: "https://reportaproblem.apple.com",
  android: "https://play.google.com/store/account/orderhistory",
  default: "https://play.google.com/store/account/orderhistory",
});

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const shortDate = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * The four beats of a trial, dated.
 *
 * Before a trial exists the dates are projected from TRIAL_DAYS so the charge
 * date is knowable *before* committing — which is the whole point. Once one is
 * running, the server's trialEndsAt takes over, because a projection that
 * disagrees with the real end date is worse than no projection at all.
 */
const buildTrialSteps = (t, { trialEndsAt, active }) => {
  const now = new Date();
  const ends = trialEndsAt ? new Date(trialEndsAt) : addDays(now, TRIAL_DAYS);
  const remind = addDays(ends, -1);

  return [
    {
      key: "install",
      icon: "checkmark",
      title: t("billing.stepInstalled"),
      detail: t("billing.stepInstalledHint"),
      reached: true,
      done: true,
    },
    {
      key: "today",
      icon: "lock-open-outline",
      title: t("billing.stepToday"),
      detail: t("billing.stepTodayHint", { days: TRIAL_DAYS }),
      reached: true,
    },
    {
      key: "remind",
      icon: "notifications-outline",
      title: t("billing.stepRemind", { date: shortDate(remind) }),
      detail: t("billing.stepRemindHint"),
      reached: active && now >= remind,
    },
    {
      key: "charge",
      icon: "diamond-outline",
      title: t("billing.stepCharge", { date: shortDate(ends) }),
      detail: t("billing.stepChargeHint"),
      reached: active && now >= ends,
    },
  ];
};

/**
 * The store, in words rather than in ours.
 *
 * `subscription.source` is a stored enum — `trial`, `app_store`, `play_store` —
 * and it was being rendered straight into the card, so the screen read
 * "Purchased via app_store". Falls back to the raw value rather than showing
 * nothing, so a source we add server-side later degrades to ugly instead of
 * blank.
 */
const sourceLabel = (t, source) => {
  const key = {
    trial: "billing.sourceTrial",
    app_store: "billing.sourceAppStore",
    play_store: "billing.sourcePlayStore",
  }[source];

  return key ? t(key) : source;
};

const Row = ({ label, value, theme }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, { color: theme.sub }]}>{label}</Text>
    <Text style={[styles.rowValue, { color: theme.ink }]}>{value}</Text>
  </View>
);

const Billing = () => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const toast = useToast();
  const {
    subscription,
    entitled,
    packages,
    canPurchase,
    loading,
    busy,
    startTrial,
    purchase,
    restore,
    refresh,
  } = useSubscription();
  const { user } = useAuth();
  const [working, setWorking] = useState(false);

  const status = subscription?.status ?? "none";
  const trialing = status === "trialing";
  // A finished trial is still a trial that happened — the offer doesn't return.
  const neverTrialed = !subscription?.trialEndsAt;
  const endsAt = formatDate(trialing ? subscription?.trialEndsAt : subscription?.expiresAt);

  const statusLabel = entitled
    ? trialing
      ? t("billing.statusTrial")
      : t("billing.statusActive")
    : status === "expired"
      ? t("billing.statusExpired")
      : t("billing.statusFree");

  /**
   * The date line under the status, which must agree with the status.
   *
   * `expiresAt` outlives the subscription it describes: once one lapses the
   * date is still there, and reading it as a renewal told someone sitting on
   * "Free" that they renew next month. On a lapsed plan that same date is when
   * it *ended*, which is the only true thing it can say.
   */
  const periodLine = !endsAt
    ? entitled
      ? t("billing.noExpiry")
      : t("billing.freeHint")
    : trialing
      ? t("billing.trialEnds", { date: endsAt })
      : entitled
        ? t("billing.renews", { date: endsAt })
        : t("billing.ended", { date: endsAt });

  /**
   * Runs a billing action and reports it in billing's own words.
   *
   * `failureMessage` is not optional in practice: the fallback used to be
   * `common.saveFailed` — "Couldn't save that. Try again." — which is what a
   * failed payment told people. Nothing was being saved, and the one thing
   * someone needs to hear when a purchase fails is that they were not charged.
   */
  const guard = async (fn, successMessage, failureMessage) => {
    const failed = failureMessage ?? t("common.saveFailed");
    setWorking(true);
    try {
      const result = await fn();
      // Declining is not a failure and must stay silent.
      if (result?.cancelled) return;
      if (result?.failed) return toast.error(failed);
      if (successMessage) toast.success(successMessage);
    } catch {
      toast.error(failed);
    } finally {
      setWorking(false);
    }
  };

  /**
   * Restore has three real outcomes and they must not all read as success.
   *
   * The store is asked what the signed-in Apple/Google account already owns. It
   * may say "nothing" — which is not a failure, just an answer. And when it does
   * find something, entitlement still arrives via RevenueCat's webhook to our
   * server, so the refresh here can legitimately land before the server has
   * caught up. Saying "restored" in that gap would be a promise we can't see.
   */
  const onRestore = async () => {
    setWorking(true);
    try {
      const result = await restore();
      if (!result?.available) return toast.info(t("billing.restoreUnavailable"));
      if (result.error) return toast.error(t("billing.restoreFailed"));
      if (!result.entitled) return toast.info(t("billing.restoreNothing"));
      // The store found a purchase; our server is the authority on whether it
      // has landed yet.
      const fresh = await refresh();
      toast.success(fresh?.entitled ? t("billing.restored") : t("billing.restoreSyncing"));
    } catch {
      toast.error(t("billing.restoreFailed"));
    } finally {
      setWorking(false);
    }
  };

  const openStore = () =>
    Linking.openURL(STORE_SUBSCRIPTIONS)
      .catch(() => Linking.openURL(STORE_SUBSCRIPTIONS_WEB))
      .catch(() => toast.error(t("billing.storeFailed")));

  const openRefund = () =>
    Linking.openURL(REFUND_URL).catch(() => toast.error(t("billing.storeFailed")));

  return (
    <GradientBackground>
      <FloatingHeader title={t("billing.title")} />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.accent} style={styles.loading} />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: theme.surfaceStrong }]}>
                  <Ionicons
                    name={entitled ? "diamond" : "diamond-outline"}
                    size={20}
                    color={theme.accent}
                  />
                </View>
                <View style={styles.badgeText}>
                  <DisplayText weight="bold" style={[styles.plan, { color: theme.ink }]}>
                    {statusLabel}
                  </DisplayText>
                  <Text style={[styles.hint, { color: theme.sub }]}>{periodLine}</Text>
                </View>
              </View>

              {/* Only while there is something to have been purchased.
                  `source` outlives the subscription too, so a lapsed account
                  read "Free" and "Purchased via App Store" in the same card —
                  two answers to "what am I on now", one of them history. The
                  ended-on date above already says a subscription existed. */}
              {entitled && subscription?.source ? (
                <Row
                  label={t("billing.purchasedVia")}
                  value={sourceLabel(t, subscription.source)}
                  theme={theme}
                />
              ) : null}
              {/* An unverified entitlement is one no store has confirmed — a
                  trial we granted ourselves. Worth saying, not worth alarm. */}
              {entitled && subscription?.verified === false ? (
                <Row
                  label={t("billing.confirmed")}
                  value={t("billing.notVerified")}
                  theme={theme}
                />
              ) : null}

              {/* Who it belongs to, in the same card as what it is — the two
                  answer one question ("what am I on, and as whom?") and split
                  across the page they read as unrelated.

                  Read from our own session, never from the billing SDK.
                  RevenueCat would put its App User ID here, an opaque hex
                  string, and the only way to make it show a name is to send
                  RevenueCat the name — personal data in a processor
                  `purge.service.js` cannot reach. We already hold both. */}
              {user?.firstName ? (
                <Row label={t("billing.accountName")} value={user.firstName} theme={theme} />
              ) : null}
              {user?.email ? (
                <Row label={t("billing.accountEmail")} value={user.email} theme={theme} />
              ) : null}
            </View>

            {/* The timeline earns its place in exactly two states: deciding
                whether to start a trial, and being on one. Once someone is a
                paying member it is history, and after it lapses it is a
                reminder of a decision already made. */}
            {(trialing || neverTrialed) && (
              <View style={styles.section}>
                <DisplayText weight="bold" style={[styles.heading, { color: theme.ink }]}>
                  {trialing ? t("billing.trialRunning") : t("billing.trialTitle")}
                </DisplayText>
                <Text style={[styles.subheading, { color: theme.sub }]}>
                  {t("billing.trialSubtitle")}
                </Text>
                <TrialTimeline
                  steps={buildTrialSteps(t, {
                    trialEndsAt: subscription?.trialEndsAt,
                    active: trialing,
                  })}
                />
              </View>
            )}

            {/* Shown while trialing too, not only when locked out.
                Gating this on `!entitled` alone hid it from everyone on a
                trial — who are exactly the people deciding whether to pay, and
                who had no way to do it until their access lapsed. Only a
                genuinely paying member has nothing to buy here. */}
            {(!entitled || trialing) && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
                  {t(trialing ? "billing.upgradeTrialing" : "billing.upgrade")}
                </DisplayText>

                {neverTrialed && (
                  <Button
                    title={t("paywall.trial")}
                    onPress={() =>
                      guard(startTrial, t("billing.trialStarted"), t("billing.trialFailed"))
                    }
                    disabled={busy || working}
                  />
                )}

                {canPurchase && packages.length > 0 && (
                  <View style={styles.actions}>
                    {packages.map((pkg) => (
                      <Button
                        key={pkg.identifier}
                        title={
                          pkg.product?.priceString
                            ? `${t("paywall.subscribe")} — ${pkg.product.priceString}`
                            : t("paywall.subscribe")
                        }
                        variant="secondary"
                        onPress={() =>
                          guard(
                            () => purchase(pkg),
                            t("billing.purchased"),
                            t("billing.purchaseFailed"),
                          )
                        }
                        disabled={busy || working}
                      />
                    ))}
                  </View>
                )}

                {/* The price sits under the button, not above it: it is what
                    you check before committing, not a headline. */}
                <Text style={[styles.price, { color: theme.sub }]}>{t("paywall.price")}</Text>

                {!canPurchase && (
                  <Text style={[styles.hint, { color: theme.sub }]}>
                    {t("billing.storeUnavailable")}
                  </Text>
                )}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
                {t("billing.manage")}
              </DisplayText>
              <Text style={[styles.hint, { color: theme.sub }]}>{t("billing.manageHint")}</Text>
              <View style={styles.actions}>
                <Button
                  title={t("billing.openStore")}
                  variant="secondary"
                  onPress={openStore}
                  testID="billing-manage"
                />
                <Button
                  title={t("billing.requestRefund")}
                  variant="secondary"
                  onPress={openRefund}
                  testID="billing-refund"
                />
                <Button
                  title={t("billing.restore")}
                  variant="secondary"
                  onPress={onRestore}
                  disabled={busy || working}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
};

export default Billing;

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingBottom: 112,
    // Clears the floating header, which overlays rather than occupies.
    // Declared after the `padding` shorthand, which would reset it.
    paddingTop: FLOATING_HEADER_INSET,
  },
  loading: { marginTop: spacing.xl },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { flex: 1 },
  plan: { fontSize: 20 },
  section: { marginBottom: spacing.lg },
  heading: { fontSize: 24, textAlign: "center" },
  subheading: {
    ...type.body,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sectionTitle: { ...type.sectionTitle, marginBottom: spacing.sm },
  price: { ...type.body, fontSize: 12, textAlign: "center", marginTop: spacing.md },
  hint: { ...type.body, fontSize: 13, marginTop: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  rowLabel: { ...type.body, fontSize: 13 },
  rowValue: { ...type.body, fontSize: 13, fontWeight: "600" },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
