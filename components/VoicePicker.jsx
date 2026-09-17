import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useT } from "../lib/i18n.js";
import { VOICES, clipUrl } from "../lib/voices.js";
import { playClip, stopSpeaking } from "../lib/voice.js";
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
 * The preview is the real voice, fetched from the server. Auditioning five
 * archetypes in the device's own speech would play the same voice five times
 * with the pitch nudged, which is worse than offering no preview at all — it
 * would actively misrepresent the thing being chosen. Device speech remains the
 * fallback when the server has no key, via `playClip`.
 *
 * A choice takes effect tomorrow, which the row says plainly. Today's audio is
 * already rendered against the current voice, so switching now would discard it
 * and pay to render it again.
 *
 * `locked` is the free plan: every voice can still be auditioned — the previews
 * are shared and cost nothing — but the choose control becomes a small
 * "Premium" tag that opens Billing instead of a radio that would be refused.
 * Locked rather than hidden, because hearing what a subscription buys is the
 * whole pitch.
 */
const VoicePicker = ({ active, pending, onChoose, locked = false, onUpgrade }) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const { client } = useAuth();

  const [loading, setLoading] = useState(null);

  const preview = async (voice) => {
    Haptics.selectionAsync().catch(() => {});
    stopSpeaking();
    setLoading(voice.key);

    let url = null;
    try {
      const res = await client.voicePreview(voice.key);
      url = clipUrl(res?.clipId);
    } catch {
      // Offline, or no key on the server. playClip reads the sample with the
      // device instead, which at least confirms the control works.
    }

    setLoading(null);
    playClip(url, { text: t(SAMPLE_KEY), ...voice.speech });
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
              {loading === voice.key ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Ionicons name="volume-medium-outline" size={20} color={theme.accent} />
              )}
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

            {locked ? (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onUpgrade?.();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("voices.premiumHint")}
                style={[styles.premium, { borderColor: theme.accent }]}
                testID={`voice-premium-${voice.key}`}
              >
                <Ionicons name="lock-closed-outline" size={12} color={theme.accent} />
                <Text style={[styles.premiumText, { color: theme.accent }]}>
                  {t("voices.premium")}
                </Text>
              </Pressable>
            ) : (
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
            )}
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
  premium: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  premiumText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  text: { flex: 1 },
  name: { fontSize: 16 },
  desc: { ...type.body, fontSize: 12, marginTop: 2 },
});
