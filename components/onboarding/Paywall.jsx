import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../GradientBackground.jsx";
import DisplayText from "../DisplayText.jsx";
import Button from "../Button.jsx";
import Spacer from "../Spacer.jsx";
import { colors, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";
import { PRIVACY_URL, TERMS_URL } from "../../lib/config.js";
// Shared with the locked screen: a second copy there quietly dropped the
// currency code and rendered "That's 4.17 a month" beside a price in dollars.
import { monthlyEquivalent } from "../../lib/purchases.js";

/**
 * The end-of-flow paywall. This is where the account gets created — either path
 * (`` / `onSubscribe`) triggers sign-up in the controller.
 *
 * There is no trial: premium is the only way to affirmations written for you,
 * and the buttons appear only when RevenueCat is configured — see
 * lib/purchases.js.
 *
 * Every price here comes from the offering's own localized string. The store is
 * the authority on what something costs in a given country, so nothing about
 * money is written into this file.
 */

const PERK_KEYS = ["paywall.perk1", "paywall.perk2", "paywall.perk3"];

const Paywall = ({ onSubscribe, canPurchase = false, packages = [] }) => {
  const { t } = useT();

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
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
                      onPress={() => onSubscribe(pkg)}
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
              <Spacer height={spacing.sm} />
            </>
          ) : null}

          <Text style={styles.price}>{t("paywall.price")}</Text>

          {/* Auto-renewal, and who charges whom. Required beside a subscription
              CTA and one of the most routinely cited 3.1.2 rejections — the
              terms document says it, but a linked document is not the point of
              sale. */}
          <Text style={styles.renewal}>{t("paywall.renewal")}</Text>

          {/* Required next to a subscription CTA (App Review 3.1.2), and the
              decent thing regardless: what the money buys, on what terms, one
              tap away rather than buried. */}
          <View style={styles.legal}>
            <Pressable
              onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
              accessibilityRole="link"
              hitSlop={8}
              testID="paywall-terms"
            >
              <Text style={styles.legalLink}>{t("legal.terms")}</Text>
            </Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable
              onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
              accessibilityRole="link"
              hitSlop={8}
              testID="paywall-privacy"
            >
              <Text style={styles.legalLink}>{t("legal.privacy")}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
};

export default Paywall;

const styles = StyleSheet.create({
  legal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  legalLink: {
    ...type.body,
    fontSize: 13,
    color: colors.white,
    textDecorationLine: "underline",
    opacity: 0.85,
  },
  legalDot: {
    color: colors.white,
    opacity: 0.6,
  },
  planWrap: { marginBottom: spacing.sm },
  perMonth: {
    ...type.body,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.xs,
    color: colors.mauveDeep,
  },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  header: {
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
  price: {
    ...type.subtitle,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  renewal: {
    ...type.subtitle,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    opacity: 0.8,
  },
});
