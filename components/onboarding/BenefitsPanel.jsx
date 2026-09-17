import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FadeInView from "../FadeInView.jsx";
import Sparkles from "../Sparkles.jsx";
import { colors, radius, shadow, spacing } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

/**
 * What a daily practice actually does for you.
 *
 * Phrased as what affirmations help you *do*, never as a clinical outcome —
 * "gentler with yourself" rather than "treats anxiety". This screen sits right
 * before the paywall, so overclaiming here would be a promise we can't keep.
 */
const BENEFITS = [
  { icon: "compass-outline", key: "onboarding.benefitFocus" },
  { icon: "swap-horizontal-outline", key: "onboarding.benefitReframe" },
  { icon: "leaf-outline", key: "onboarding.benefitGentle" },
];

const BenefitsPanel = () => {
  const { t } = useT();

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Sparkles />
        <FadeInView delay={80}>
          <View style={styles.badge}>
            <Ionicons name="book-outline" size={54} color={colors.coral} />
          </View>
        </FadeInView>
      </View>

      <View style={styles.list}>
        {BENEFITS.map((benefit, index) => (
          <FadeInView key={benefit.icon} delay={260 + index * 120}>
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={benefit.icon} size={20} color={colors.coral} />
              </View>
              <Text style={styles.text}>{t(benefit.key)}</Text>
            </View>
          </FadeInView>
        ))}
      </View>
    </View>
  );
};

export default BenefitsPanel;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xl,
  },
  hero: {
    height: 170,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.soft,
  },
  list: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
});
