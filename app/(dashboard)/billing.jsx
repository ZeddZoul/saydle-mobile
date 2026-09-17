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
import SubscriptionDisclosure from "../../components/SubscriptionDisclosure.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useSubscription } from "../../hooks/useSubscription.js";
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

/**
 * The store, in words rather than in ours.
 *
 * `subscription.source` is a stored enum — `app_store`, `play_store`,
 * `promotional` (see server/src/models/User.js) — and it was being rendered
 * straight into the card, so the screen read "Purchased via app_store". Falls
 * back to the raw value rather than showing nothing, so a source we add
 * server-side later degrades to ugly instead of blank.
 */
const sourceLabel = (t, source) => {
  const key = {
    app_store: "billing.sourceAppStore",
    play_store: "billing.sourcePlayStore",
    promotional: "billing.sourcePromotional",
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
    purchase,
    restore,
    refresh,
  } = useSubscription();
  const { user } = useAuth();
  const [working, setWorking] = useState(false);

  const status = subscription?.status ?? "none";
  const endsAt = formatDate(subscription?.expiresAt);

  const statusLabel = entitled
    ? t("billing.statusActive")
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
    : entitled
      ? t("billing.renews", { date: endsAt })
      : t("billing.ended", { date: endsAt });

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

  /**
   * Buying, with the same honesty as restoring.
   *
   * `settled` is the hook telling us whether the server has actually seen the
   * purchase yet. Saying "you're subscribed" before it has would be promising
   * something we cannot see, and the screen behind the toast would still say
   * Free — so an unsettled purchase gets its own, truthful line.
   */
  const onPurchase = async (pkg) => {
    setWorking(true);
    try {
      const result = await purchase(pkg);
      if (result?.cancelled) return;
      if (result?.failed) return toast.error(t("billing.purchaseFailed"));
      toast.success(result?.settled ? t("billing.purchased") : t("billing.purchaseSyncing"));
    } catch {
      toast.error(t("billing.purchaseFailed"));
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
              {/* An unverified entitlement is one no store has confirmed yet —
                  the webhook is still on its way, or the grant was ours
                  (promotional). Worth saying, not worth alarm. */}
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

            {/* Only a paying member has nothing to buy here. There is no
                trial: a free reader scrolls the curated bank, and this is the
                one way to the affirmations written for them. */}
            {!entitled && (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
                  {t("billing.upgrade")}
                </DisplayText>

                <Text style={[styles.hint, { color: theme.sub }]}>
                  {t("billing.upgradeBody")}
                </Text>

                <Text style={[styles.kicker, { color: theme.ink }]}>
                  {t("billing.upgradeKicker")}
                </Text>

                {/* Proof rather than promise: one line Saydle actually wrote
                    for this person at signup, with their name and their
                    situation in it. Nothing else on this screen argues as
                    well, and there is nothing to show if it never landed. */}
                {subscription?.sampleLine ? (
                  <View style={[styles.sample, { borderColor: theme.border }]}>
                    <Text style={[styles.sampleEyebrow, { color: theme.accent }]}>
                      {t("billing.sampleEyebrow")}
                    </Text>
                    <DisplayText style={[styles.sampleText, { color: theme.ink }]}>
                      {subscription.sampleLine}
                    </DisplayText>
                    <Text style={[styles.hint, { color: theme.sub }]}>
                      {t("billing.sampleFooter")}
                    </Text>
                  </View>
                ) : null}

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
                        onPress={() => onPurchase(pkg)}
                        disabled={busy || working}
                      />
                    ))}
                  </View>
                )}

                {/* The terms sit under the button, not above it: they are
                    what you check before committing, not a headline. Period,
                    price per period, renewal, and where to cancel — all read
                    from the offering, and required by both stores. */}
                <SubscriptionDisclosure
                  packages={canPurchase ? packages : []}
                  color={theme.sub}
                  linkColor={theme.accent}
                  style={styles.disclosure}
                  onLinkError={() => toast.error(t("legal.openFailed"))}
                />

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
  kicker: { ...type.sectionTitle, fontSize: 17, marginTop: spacing.md },
  sample: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  sampleEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sampleText: { fontSize: 22, lineHeight: 30 },
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
  disclosure: { marginTop: spacing.md },
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
