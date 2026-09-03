import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { PRIVACY_URL, TERMS_URL } from "../lib/legal.js";
import { useT } from "../lib/i18n.js";
import { colors, spacing } from "../theme/tokens.js";

/**
 * "Terms of Use · Privacy Policy", tappable.
 *
 * Appears wherever a subscription is offered (App Review looks for it there)
 * and on the landing screen, so the documents are reachable before an account
 * exists. Opening fails quietly: a browser that cannot open a URL is not a
 * problem this app can do anything about, and `onError` lets a screen with a
 * toast say so if it wants to.
 */
const LegalLinks = ({ color = colors.mauveDeep, style, onError }) => {
  const { t } = useT();

  const open = (url) => Linking.openURL(url).catch(() => onError?.());

  return (
    <View style={[styles.row, style]}>
      <Pressable
        onPress={() => open(TERMS_URL)}
        hitSlop={8}
        accessibilityRole="link"
        testID="legal-terms"
      >
        <Text style={[styles.link, { color }]}>{t("legal.terms")}</Text>
      </Pressable>
      <Text style={[styles.dot, { color }]}>·</Text>
      <Pressable
        onPress={() => open(PRIVACY_URL)}
        hitSlop={8}
        accessibilityRole="link"
        testID="legal-privacy"
      >
        <Text style={[styles.link, { color }]}>{t("legal.privacy")}</Text>
      </Pressable>
    </View>
  );
};

export default LegalLinks;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  dot: { fontSize: 13 },
});
