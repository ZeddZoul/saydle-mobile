import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import GradientBackground from "../components/GradientBackground.jsx";
import DisplayText from "../components/DisplayText.jsx";
import Sparkles from "../components/Sparkles.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import Button from "../components/Button";
import Spacer from "../components/Spacer";
import { colors, spacing } from "../theme/tokens.js";
import { useT } from "../lib/i18n.js";

const Home = () => {
  const { t } = useT();
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Sparkles />
            <DisplayText weight="bold" style={styles.wordmark}>
              Saydle
            </DisplayText>
            <DisplayText weight="italic" style={styles.tagline}>
              {t("landing.tagline")}
            </DisplayText>
          </View>

          <View style={styles.proof}>
            {/* Placeholder social proof — replace with a real, substantiated line. */}
            <View style={styles.stat}>
              <MaterialCommunityIcons
                name="leaf"
                size={26}
                color={colors.mauve}
                style={styles.leafLeft}
              />
              <Text style={styles.statText}>{t("landing.proof")}</Text>
              <MaterialCommunityIcons
                name="leaf"
                size={26}
                color={colors.mauve}
                style={styles.leafRight}
              />
            </View>

            <TestimonialCarousel />
          </View>

          <View style={styles.actions}>
            <Button
              title={t("landing.getStarted")}
              onPress={() => router.push("/onboarding")}
            />
            <Spacer height={spacing.md} />
            <Button
              title={t("landing.haveAccount")}
              variant="secondary"
              onPress={() => router.push("/login")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
};

export default Home;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  wordmark: {
    fontSize: 52,
    color: colors.ink,
  },
  tagline: {
    color: colors.mauveDeep,
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 260,
  },
  proof: {
    alignItems: "center",
    gap: spacing.lg,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.mauveDeep,
    letterSpacing: 0.3,
  },
  leafLeft: {
    transform: [{ rotate: "35deg" }],
  },
  leafRight: {
    transform: [{ rotate: "-35deg" }, { scaleX: -1 }],
  },
  actions: {
    marginTop: spacing.xl,
  },
});
