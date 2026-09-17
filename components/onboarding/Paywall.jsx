import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../GradientBackground.jsx";
import DisplayText from "../DisplayText.jsx";
import Button from "../Button.jsx";
import Spacer from "../Spacer.jsx";
import SubscriptionDisclosure from "../SubscriptionDisclosure.jsx";
import { colors, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

/**
 * The end-of-flow paywall. This is where the account gets created — every path
 * off this screen (`onSubscribe`, `onContinueFree`) triggers sign-up in the
 * controller.
 *
 * There is no trial and the free plan is not hidden: the curated bank is a real
 * product, and "Continue with the free plan" is always on screen, because a
 * paywall someone cannot decline is the one App Review rejects and the one a
 * reader resents. Premium is the only way to affirmations written for you, to a
 * real voice in Practice, and to keeping your own words.
 *
 * The plan buttons appear only when RevenueCat is configured — see
 * lib/purchases.js. Every price here comes from the offering's own localized
 * string. The store is the authority on what something costs in a given
 * country, so nothing about money is written into this file.
 *
 * "Restore purchases" cannot restore anything yet: there is no account to attach
 * a purchase to until one of the two buttons creates it. So it is the honest
 * version — it sends someone who already paid to sign in, where the billing
 * screen's restore can find their purchase.
 */

/** Per-month equivalent, so the two terms can actually be compared. */
const monthlyEquivalent = (pkg) => {
  const price = pkg?.product?.price;
  const period = pkg?.packageType;
  if (typeof price !== "number" || period !== "ANNUAL") return null;

  const currency = pkg.product.currencyCode ?? "";
  const per = (price / 12).toFixed(2);
  return `${currency} ${per}`.trim();
};
const PERK_KEYS = ["paywall.perk1", "paywall.perk2", "paywall.perk3"];

const Paywall = ({
  onSubscribe,
  onContinueFree,
  onBack,
  onRestore,
  onRetry,
  canPurchase = false,
  packages = [],
  plansLoading = false,
  busy = false,
}) => {
  const { t } = useT();

  const hasPlans = canPurchase && packages.length > 0;
  // The store answered with nothing, or never answered. Distinct from "no
  // store configured", which simply shows no plans and no complaint.
  const plansFailed = canPurchase && !plansLoading && packages.length === 0;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            style={styles.headerButton}
            testID="paywall-back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.mauveDeep} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <DisplayText weight="bold" style={styles.title}>
              {t("paywall.title")}
            </DisplayText>
            <Text style={styles.subtitle}>{t("paywall.subtitle")}</Text>
          </View>

          <View style={styles.perks}>
            {PERK_KEYS.map((key) => (
              <View key={key} style={styles.perk}>
                <Ionicons name="checkmark-circle" size={22} color={colors.coral} />
                <Text style={styles.perkText}>{t(key)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {/* Hidden until there is something to actually buy: an unset
              RevenueCat key means these could never complete, and a button that
              silently does nothing is worse than no button. */}
          {hasPlans ? (
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
                      onPress={() => onSubscribe(pkg)}
                      disabled={busy}
                      testID={`paywall-plan-${pkg.identifier}`}
                    />
                    {/* The per-month figure is the whole argument for annual,
                        and it is arithmetic on the store's own number rather
                        than a claim of ours. */}
                    {per ? (
                      <Text style={styles.perMonth}>
                        {t("paywall.perMonth", { price: per })}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              <SubscriptionDisclosure packages={packages} style={styles.disclosure} />
              <Spacer height={spacing.sm} />
            </>
          ) : null}

          {plansFailed ? (
            <View style={styles.plansFailed} testID="paywall-plans-failed">
              <Text style={styles.plansFailedText}>{t("paywall.plansFailed")}</Text>
              <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>{t("common.tryAgain")}</Text>
              </Pressable>
            </View>
          ) : null}

          <Button
            title={t("paywall.continueFree")}
            variant={hasPlans ? "secondary" : "primary"}
            onPress={onContinueFree}
            disabled={busy}
            testID="paywall-free"
          />

          <Pressable
            onPress={onRestore}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.restore}
            testID="paywall-restore"
          >
            <Text style={styles.link}>{t("billing.restore")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
};

export default Paywall;

const styles = StyleSheet.create({
  planWrap: { marginBottom: spacing.sm },
  perMonth: {
    ...type.body,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.xs,
    color: colors.mauveDeep,
  },
  disclosure: { marginTop: spacing.sm },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    minHeight: 40,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 26,
    justifyContent: "center",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  intro: {
    alignItems: "center",
    marginBottom: spacing.xxl,
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
  perks: {
    // width:100% so each row has a defined width — otherwise the flex:1 label
    // collapses to zero and only the checkmark shows.
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    gap: spacing.lg,
  },
  perk: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  perkText: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  plansFailed: {
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  plansFailedText: {
    ...type.subtitle,
    textAlign: "center",
  },
  restore: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mauveDeep,
    textDecorationLine: "underline",
  },
});
