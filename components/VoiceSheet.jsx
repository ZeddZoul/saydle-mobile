import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import VoicePicker from "./VoicePicker.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { stopSpeaking } from "../lib/voice.js";
import { useT } from "../lib/i18n.js";
import { spacing, type } from "../theme/tokens.js";

/**
 * The voice, chosen where it is heard.
 *
 * A sheet rather than a row buried in Profile: the five only differ audibly, so
 * the choice has to be made next to the session it changes, with the option to
 * hear each one on the spot.
 */
const VoiceSheet = ({
  visible,
  active,
  pending,
  onChoose,
  onClose,
  locked = false,
  onUpgrade,
}) => {
  const { t } = useT();
  const { theme } = useAppTheme();

  const close = () => {
    // Nothing should still be talking once the sheet is gone.
    stopSpeaking();
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.sheet, { backgroundColor: theme.gradient[0] }]} testID="voice-sheet">
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.ink }]}>{t("voices.title")}</Text>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t("share.close")}
              hitSlop={10}
              testID="voice-close"
            >
              <Ionicons name="close" size={24} color={theme.sub} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.hint, { color: theme.sub }]}>
              {t(locked ? "voices.lockedHint" : "voices.hint")}
            </Text>
            <VoicePicker
              active={active}
              pending={pending}
              onChoose={onChoose}
              locked={locked}
              onUpgrade={onUpgrade}
            />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default VoiceSheet;

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: { ...type.sectionTitle, fontSize: 20 },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  hint: { ...type.body, fontSize: 14, lineHeight: 20 },
});
