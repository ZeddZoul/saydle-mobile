import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../components/GradientBackground.jsx";
import DisplayText from "../components/DisplayText.jsx";
import Sparkles from "../components/Sparkles.jsx";
import LegalLinks from "../components/LegalLinks.jsx";
import Button from "../components/Button";
import Spacer from "../components/Spacer";
import { colors, spacing } from "../theme/tokens.js";
import { useT } from "../lib/i18n.js";

/**
 * The landing screen: the wordmark, one honest sentence, and two doors.
 *
 * It used to carry "Loved by early users", five stars and a carousel of quotes
 * — all placeholders, none substantiated. Social proof we cannot stand behind
 * is worse than none, so the space now says what the product is instead.
 */
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

          <Text style={styles.blurb}>{t("landing.blurb")}</Text>

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

            {/* Reachable before an account exists — the documents describe
                what signing up agrees to, so they cannot live only behind it. */}
            <LegalLinks style={styles.legal} />
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
    paddingBottom: spacing.xl,
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
  blurb: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.mauveDeep,
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 320,
  },
  actions: {
    marginTop: spacing.xl,
  },
  legal: {
    marginTop: spacing.lg,
  },
});
