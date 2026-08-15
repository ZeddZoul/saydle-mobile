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
 * (`onTrial` / `onSubscribe`) triggers sign-up in the controller.
 *
 * The trial is real: it is granted server-side and expires on a date. The
 * subscription button appears only when RevenueCat is configured — see
 * lib/purchases.js.
 *
 * PLACEHOLDER: the price line is still hardcoded copy. Once there is a store
 * listing it should come from the offering's own localized price string — the
 * store is the authority on what something costs in a given country, and a
 * hardcoded "$4.99" is wrong everywhere else.
 */
const PERK_KEYS = ["paywall.perk1", "paywall.perk2", "paywall.perk3"];

const Paywall = ({ onTrial, onSubscribe, canPurchase = false }) => {
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
          <Text style={styles.price}>{t("paywall.price")}</Text>
          <Button title={t("paywall.trial")} onPress={onTrial} />
          <Spacer height={spacing.md} />
          {/* Hidden until there is something to actually buy: an unset RevenueCat
            key means tapping this could only ever fall through to the trial,
            and a button that silently does something else is worse than no
            button. */}
          {canPurchase ? (
            <Button title={t("paywall.subscribe")} variant="secondary" onPress={onSubscribe} />
          ) : null}
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
};

export default Paywall;

const styles = StyleSheet.create({
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
