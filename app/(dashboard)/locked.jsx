import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Button from "../../components/Button.jsx";
import DeleteAccountSheet from "../../components/DeleteAccountSheet.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSubscription } from "../../hooks/useSubscription.js";
import { monthlyEquivalent } from "../../lib/purchases.js";
import { SLOW_SETTLE, pollUntil } from "../../lib/settle.js";
import { useT } from "../../lib/i18n.js";
import { PRIVACY_URL, TERMS_URL, DELETION_GRACE_DAYS } from "../../lib/config.js";
import { radius, shadow, spacing, type } from "../../theme/tokens.js";

const SUPPORT_MAILTO = "mailto:support@saydle.com";

/**
 * Three promises, all in the register the headline sets: what gets written.
 *
 * Shared with the onboarding paywall rather than restated. The two screens make
 * the same argument to the same person, and a second copy is a second thing to
 * keep true — the previous one still promised "offline access to your saved
 * favorites", which under a hard paywall is not something an unpaid reader has.
 */
const PERK_KEYS = ["paywall.perk1", "paywall.perk2", "paywall.perk3"];

/**
 * One rise-and-fade, used for both tiers.
 *
 * The screen arrives by redirect rather than by a tap, so without this it pops
 * into place. The card is offset behind the hero by a beat — enough to read as
 * sequence, short enough that nobody waits for it.
 */
function useEntrance(delay = 0) {
  const anim = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (cancelled) return;
        if (on) {
          // The static version, not a faster one: someone who asked for less
          // motion has asked for none, not for the same thing hurried.
          setReduced(true);
          anim.setValue(1);
          return;
        }
        Animated.timing(anim, {
          toValue: 1,
          duration: 420,
          delay,
          // Decelerating: quick off the mark, settling rather than stopping.
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        if (!cancelled) anim.setValue(1);
      });

    return () => {
      cancelled = true;
    };
  }, [anim, delay]);

  return {
    opacity: anim,
    transform: reduced
      ? []
      : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };
}

/**
 * What an account that has not paid sees, and the only thing it sees.
 *
 * The paywall is hard: the route guard sends every other screen here, so this
 * page has to do four jobs at once rather than being a tab among tabs.
 *
 *   1. Sell. It leads with the argument and, where there is one, the line
 *      Saydle actually wrote for this person at signup — proof rather than
 *      promise, and the only thing here a competitor could not also claim.
 *   2. Let them buy, and let them restore. Restore is required by Apple
 *      wherever a subscription is sold, and it is how someone who reinstalled
 *      gets back what they already paid for.
 *   3. Show the terms. Required beside a subscription CTA (App Review 3.1.2).
 *   4. Let them leave. Sign out and delete account are here rather than on
 *      Profile because Profile is behind the same gate: account deletion has to
 *      be reachable inside the app (guideline 5.1.1(v)) and the privacy policy
 *      promises it, so a paywall in front of it would be a rejection and a
 *      broken promise at once.
 *
 * Those four are not equals, and the layout has to say so. The offer sits in a
 * raised surface holding the only two filled buttons on the screen; everything
 * else is text. Sign out and delete are a quiet footer well below the decision —
 * reachable, never competing. The first pass had them as full-width buttons
 * identical to the purchase, which read as four equally likely things to do.
 */
const LockedScreen = () => {
  const { user, signOut, deleteAccount } = useAuth();
  const { theme } = useAppTheme();
  const { t } = useT();
  const toast = useToast();

  const { subscription, packages, canPurchase, loading, busy, purchase, restore, refresh } =
    useSubscription();

  // Set by onboarding when the store took the money and the webhook had not
  // landed within nine seconds. Nothing else sets it, so an ordinary visitor
  // costs no extra requests.
  const { settling } = useLocalSearchParams();
  const [awaitingWebhook, setAwaitingWebhook] = useState(Boolean(settling));

  const [deleting, setDeleting] = useState(false);
  const hero = useEntrance(0);
  const offer = useEntrance(90);

  /**
   * Keeps asking on behalf of someone who has already paid.
   *
   * A webhook was measured taking eighty seconds. Onboarding waits nine of
   * those and hands the rest here, so the screen repaints itself rather than
   * presenting the offer to someone who has already accepted it — nobody should
   * have to discover Restore to get what they just bought.
   *
   * `refresh` syncs entitlement into the session, so the route guard opens the
   * app the moment this lands. Bounded on purpose: entitlement is server-truth
   * and the next foreground corrects it anyway.
   */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!awaitingWebhook) return;

    // A flag read after the fact would not have stopped anything: the ladder's
    // sleeps are already running, so the poll went on asking the API for the
    // best part of a minute after the screen was gone.
    const controller = new AbortController();

    pollUntil(
      () => refreshRef.current(),
      (fresh) => fresh.entitled,
      SLOW_SETTLE,
      {
        signal: controller.signal,
      },
    ).finally(() => {
      if (!controller.signal.aborted) setAwaitingWebhook(false);
    });

    return () => controller.abort();
  }, [awaitingWebhook]);

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
          {awaitingWebhook ? (
            <View style={[styles.settling, { borderColor: theme.border }]}>
              <Ionicons name="time-outline" size={18} color={theme.accent} />
              <Text style={[styles.settlingText, { color: theme.ink }]}>
                {t("paywall.settling")}
              </Text>
            </View>
          ) : null}

          <Animated.View style={[styles.hero, hero]}>
            <DisplayText weight="bold" style={[styles.title, { color: theme.ink }]}>
              {t("locked.title")}
            </DisplayText>
            <Text style={[styles.lede, { color: theme.sub }]}>{t("locked.body")}</Text>
          </Animated.View>

          {/* The offer, raised off the backdrop. Everything a reader needs in
              order to decide is inside this one surface; nothing that isn't, is. */}
          <Animated.View
            style={[styles.offer, { backgroundColor: theme.surfaceStrong }, offer]}
          >
            {/* Proof where we have it, promise where we do not — never a claim
                we cannot back. The card is captioned "here's one Saydle wrote
                for you", so it may only ever hold a line the model actually
                wrote for this account. */}
            {subscription?.sampleLine ? (
              <View style={[styles.sample, { borderColor: theme.border }]}>
                <Text style={[styles.eyebrow, { color: theme.accent }]}>
                  {t("billing.sampleEyebrow")}
                </Text>
                <DisplayText style={[styles.sampleText, { color: theme.ink }]}>
                  {subscription.sampleLine}
                </DisplayText>
                <Text style={[styles.sampleFoot, { color: theme.sub }]}>
                  {t("billing.sampleFooter")}
                </Text>
              </View>
            ) : (
              <View style={styles.perks}>
                {PERK_KEYS.map((key) => (
                  <View key={key} style={styles.perk}>
                    <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                    <Text style={[styles.perkText, { color: theme.ink }]}>{t(key)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Hidden rather than disabled when there is nothing to sell: a
                button that cannot complete is worse than no button. */}
            {canPurchase && packages.length > 0 ? (
              <View style={styles.plans}>
                {packages.map((pkg) => {
                  const annual = pkg.packageType === "ANNUAL";
                  const per = monthlyEquivalent(pkg);

                  return (
                    <View key={pkg.identifier}>
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
              </View>
            ) : loading ? (
              // Not "purchases aren't available on this device": an offering
              // takes a round-trip to RevenueCat, and for that second every
              // visitor was told the store was broken. It is the sentence a
              // reviewer would screenshot, and it was never true when shown.
              <ActivityIndicator color={theme.accent} testID="locked-offering" />
            ) : (
              <Text style={[styles.unavailable, { color: theme.sub }]}>
                {t("billing.storeUnavailable")}
              </Text>
            )}

            <Text style={[styles.cancelAnytime, { color: theme.sub }]}>
              {t("paywall.price")}
            </Text>

            {/* The same renewal terms the onboarding paywall carries. This is
                the screen a reviewer actually lands on, so if only one of the
                two were to have it, it would be this one. */}
            <Text style={[styles.renewal, { color: theme.ink }]}>{t("paywall.renewal")}</Text>

            {/* Required beside a subscription CTA, and the decent thing anyway. */}
            <View style={styles.legal}>
              <Pressable onPress={() => open(TERMS_URL)} accessibilityRole="link" hitSlop={8}>
                <Text style={[styles.legalLink, { color: theme.sub }]}>{t("legal.terms")}</Text>
              </Pressable>
              <Text style={[styles.legalDot, { color: theme.sub }]}>·</Text>
              <Pressable onPress={() => open(PRIVACY_URL)} accessibilityRole="link" hitSlop={8}>
                <Text style={[styles.legalLink, { color: theme.sub }]}>
                  {t("legal.privacy")}
                </Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* Outside the card and unfilled: findable, which is what Apple asks,
              without competing with the thing the card is for. */}
          <Pressable
            onPress={onRestore}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.restoreWrap}
          >
            <Text style={[styles.restore, { color: theme.ink }]}>{t("billing.restore")}</Text>
          </Pressable>

          {/* The way out, and a way to ask. Quiet on purpose: reachable for the
              person who needs it, invisible to the person deciding. */}
          <View style={styles.footer}>
            <View style={[styles.rule, { backgroundColor: theme.border }]} />

            <Text style={[styles.footNote, { color: theme.sub }]}>
              {t("locked.supportHint")}
            </Text>
            <Pressable
              onPress={() => open(SUPPORT_MAILTO)}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Text style={[styles.footLink, { color: theme.sub }]}>{t("locked.support")}</Text>
            </Pressable>

            {user?.email ? (
              <Text style={[styles.footNote, styles.signedIn, { color: theme.sub }]}>
                {t("locked.signedInAs", { email: user.email })}
              </Text>
            ) : null}

            <View style={styles.footActions}>
              <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.footLink, { color: theme.sub }]}>
                  {t("profile.signOut")}
                </Text>
              </Pressable>
              <Text style={[styles.legalDot, { color: theme.sub }]}>·</Text>
              <Pressable
                onPress={() => setDeleting(true)}
                accessibilityRole="button"
                hitSlop={8}
                testID="locked-delete"
              >
                <Text style={[styles.footLink, { color: theme.danger }]}>
                  {t("profile.deleteAccount")}
                </Text>
              </Pressable>
            </View>
          </View>
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
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },

  settling: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  settlingText: { ...type.body, flex: 1, fontSize: 14, lineHeight: 20 },

  hero: { alignItems: "center", marginBottom: spacing.xl },
  title: {
    ...type.screenTitle,
    // Display type tightens; body loosens. At 32px, zero tracking reads as
    // merely big rather than composed — the project already tracks its
    // affirmation face for the same reason.
    letterSpacing: -0.5,
    textAlign: "center",
  },
  lede: {
    ...type.subtitle,
    textAlign: "center",
    marginTop: spacing.md,
    // A measure rather than a full-bleed line: ~50 characters reads far better
    // than the whole width of the screen.
    maxWidth: 330,
  },

  offer: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  sample: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    ...type.label,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sampleText: {
    ...type.sectionTitle,
    fontSize: 22,
    lineHeight: 30,
    marginTop: spacing.sm,
  },
  sampleFoot: { ...type.subtitle, fontSize: 13, marginTop: spacing.sm },

  perks: { gap: spacing.md, marginBottom: spacing.xl },
  // flex:1 on the label needs the row to have a width, or it collapses to zero
  // and only the checkmark shows.
  perk: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  perkText: { ...type.body, flex: 1, fontSize: 15, lineHeight: 21 },

  plans: { gap: spacing.sm },
  perMonth: { ...type.subtitle, fontSize: 13, textAlign: "center", marginTop: spacing.sm },
  unavailable: { ...type.subtitle, fontSize: 13, textAlign: "center" },
  cancelAnytime: {
    ...type.subtitle,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.lg,
  },

  renewal: {
    ...type.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    marginTop: spacing.sm,
  },

  legal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  legalLink: { ...type.subtitle, fontSize: 13, textDecorationLine: "underline" },
  legalDot: { ...type.subtitle, fontSize: 13, opacity: 0.6 },

  restoreWrap: { alignItems: "center", marginTop: spacing.lg },
  restore: {
    ...type.body,
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  footer: { alignItems: "center", marginTop: spacing.xxxl },
  rule: { height: 1, alignSelf: "stretch", opacity: 0.35, marginBottom: spacing.xl },
  footNote: { ...type.subtitle, fontSize: 13, textAlign: "center" },
  footLink: { ...type.subtitle, fontSize: 13, textDecorationLine: "underline" },
  signedIn: { marginTop: spacing.xl },
  footActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
