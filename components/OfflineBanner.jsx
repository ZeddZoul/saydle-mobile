import { StyleSheet, Text, View } from "react-native";
import { useT } from "../lib/i18n.js";

/**
 * Shown when the last sync failed but cached content is still on screen.
 *
 * Deliberately reassuring rather than alarming: offline is a supported state
 * here, not an error, and the affirmation below it is perfectly real.
 */
const OfflineBanner = ({ visible }) => {
  const { t } = useT();
  if (!visible) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{t("offline.banner")}</Text>
    </View>
  );
};

export default OfflineBanner;

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#C49EBB",
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: "100%",
    alignItems: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
});
