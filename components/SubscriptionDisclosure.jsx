import { Platform, StyleSheet, Text, View } from "react-native";
import LegalLinks from "./LegalLinks.jsx";
import { describePackages } from "../lib/subscriptionTerms.js";
import { useT } from "../lib/i18n.js";
import { colors, spacing } from "../theme/tokens.js";

/**
 * The small print under the plan buttons, on both screens that sell one.
 *
 * Per package: the store's title, the period, and the price per period — all
 * read from the offering, never written here. Then the renewal sentence the
 * stores require, naming the place a subscription is actually managed, and the
 * Terms / Privacy links. Rendered only when there is something to disclose:
 * with no packages there is no term to describe.
 */
const SubscriptionDisclosure = ({
  packages = [],
  color = colors.mauveDeep,
  linkColor = colors.mauveDeep,
  style,
  onLinkError,
}) => {
  const { t } = useT();
  const terms = describePackages(t, packages);

  if (terms.length === 0) return null;

  return (
    <View style={[styles.wrap, style]} testID="subscription-disclosure">
      {terms.map((term) => (
        <Text key={term.id} style={[styles.term, { color }]}>
          {term.title}
          {term.length ? ` · ${term.length}` : ""}
          {` · ${term.line}`}
        </Text>
      ))}

      <Text style={[styles.renewal, { color }]}>
        {t(
          Platform.select({
            android: "billing.renewalTermsAndroid",
            default: "billing.renewalTermsIos",
          }),
        )}
      </Text>

      <LegalLinks color={linkColor} style={styles.links} onError={onLinkError} />
    </View>
  );
};

export default SubscriptionDisclosure;

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  term: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  renewal: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  links: { marginTop: spacing.sm },
});
