import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../GradientBackground.jsx";
import DisplayText from "../DisplayText.jsx";
import Button from "../Button.jsx";
import Spacer from "../Spacer.jsx";
import { colors, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

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
    marginBottom: spacing.md,
  },
});
