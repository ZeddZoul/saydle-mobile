import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useT } from "../lib/i18n.js";
import { VOICES } from "../lib/voices.js";
import { speakLine, stopSpeaking } from "../lib/voice.js";
import { radius, spacing, type } from "../theme/tokens.js";

/** Short enough to hear the voice, long enough to judge it. */
const SAMPLE_KEY = "voices.sample";

/**
 * Five voices, each auditionable before it is chosen.
 *
 * Tapping a row plays it rather than selecting it — the whole reason to offer
 * five is that the difference between them is audible, not describable, and a
 * list of names would make people pick blind. Choosing is a separate,
 * deliberate tap.
 *
 * A choice takes effect tomorrow, which the row says plainly. Today's audio is
 * already rendered against the current voice, so switching now would discard it
 * and pay to render it again.
 */
const VoicePicker = ({ active, pending, onChoose }) => {
  const { t } = useT();
  const { theme } = useAppTheme();

  const preview = (voice) => {
    Haptics.selectionAsync().catch(() => {});
    stopSpeaking();
    speakLine(t(SAMPLE_KEY), voice.speech);
  };

  return (
    <View style={styles.wrap}>
      {VOICES.map((voice) => {
        const isActive = voice.key === active;
        const isPending = voice.key === pending;

        return (
          <View
            key={voice.key}
            style={[
              styles.row,
              { borderColor: isActive || isPending ? theme.accent : theme.border },
            ]}
          >
            <Pressable
              onPress={() => preview(voice)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t(`voices.${voice.key}.preview`)}
              style={styles.play}
              testID={`voice-preview-${voice.key}`}
            >
              <Ionicons name="volume-medium-outline" size={20} color={theme.accent} />
            </Pressable>

            <View style={styles.text}>
              <DisplayText style={[styles.name, { color: theme.ink }]}>
                {t(`voices.${voice.key}.name`)}
              </DisplayText>
              <Text style={[styles.desc, { color: theme.sub }]} numberOfLines={1}>
                {isPending
                  ? t("voices.fromTomorrow")
                  : isActive
                    ? t("voices.readingToday")
                    : t(`voices.${voice.key}.desc`)}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChoose?.(voice.key);
              }}
              hitSlop={8}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive || isPending }}
              accessibilityLabel={t(`voices.${voice.key}.name`)}
              style={styles.pick}
              testID={`voice-choose-${voice.key}`}
            >
              <Ionicons
                name={isActive || isPending ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={isActive || isPending ? theme.accent : theme.border}
              />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};

export default VoicePicker;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  play: { padding: spacing.xs },
  pick: { padding: spacing.xs },
  text: { flex: 1 },
  name: { fontSize: 16 },
  desc: { ...type.body, fontSize: 12, marginTop: 2 },
});
