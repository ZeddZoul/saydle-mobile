import { useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import FadeInView from "../FadeInView.jsx";
import DisplayText from "../DisplayText.jsx";
import { MAX_PER_DAY, toClock, toMinutes } from "../../lib/reminders.js";
import { colors, radius, shadow, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";

const SAMPLE = "I can begin before I feel ready.";

const toDate = (time) => {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const fromDate = (date) => toClock(date.getHours() * 60 + date.getMinutes());

/**
 * The reminder window: how many a day, and between which hours — with a preview
 * of what will actually land on the lock screen.
 *
 * The preview is the persuasive bit: it shows a real affirmation in a real
 * notification shape, so the value is obvious before we ask for permission.
 */
/**
 * @param {object}   props
 * @param {boolean}  props.compact  drop the notification preview (settings screen)
 * @param {function} props.onChange fires on every change, for live UI
 * @param {function} props.onCommit fires when a change settles — slider release,
 *                                  time chosen — so a settings screen can save
 *                                  once instead of on every slider tick.
 */
const ReminderSetup = ({ value, onChange, onCommit, compact = false, disabled = false }) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const settings = { count: 3, start: "09:00", end: "22:00", ...(value ?? {}) };
  const [picking, setPicking] = useState(null); // "start" | "end" | null
  const pop = useRef(new Animated.Value(1)).current;

  const setCount = (count) => {
    const next = Math.round(count);
    if (next === settings.count) return;
    Haptics.selectionAsync().catch(() => {});
    pop.setValue(0.85);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start();
    onChange({ ...settings, count: next });
  };

  const setTime = (which) => (_event, date) => {
    // Android's dialog is one-shot; iOS's inline picker stays open.
    if (Platform.OS !== "ios") setPicking(null);
    if (!date) return;

    const time = fromDate(date);
    const next = { ...settings, [which]: time };

    // Keep the window running forwards — an end before the start would schedule
    // only the opening reminder.
    if (toMinutes(next.start) >= toMinutes(next.end)) return;
    onChange(next);
    onCommit?.(next);
  };

  const TimeRow = ({ which, label }) => (
    <View style={styles.timeRow}>
      <Text style={[styles.timeLabel, { color: theme.sub }]}>{label}</Text>

      {Platform.OS === "ios" ? (
        <DateTimePicker
          value={toDate(settings[which])}
          mode="time"
          display="compact"
          onChange={setTime(which)}
          accessibilityLabel={label}
        />
      ) : (
        <>
          <Pressable
            onPress={() => setPicking(which)}
            style={[styles.timeChip, { backgroundColor: theme.surfaceStrong }]}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${settings[which]}`}
          >
            <Text style={[styles.timeChipText, { color: theme.ink }]}>{settings[which]}</Text>
          </Pressable>
          {picking === which ? (
            <DateTimePicker
              value={toDate(settings[which])}
              mode="time"
              onChange={setTime(which)}
            />
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {compact ? null : (
        <FadeInView delay={60}>
          <View style={[styles.preview, { backgroundColor: theme.surfaceStrong }]}>
            <View style={[styles.previewIcon, { backgroundColor: theme.accent }]}>
              <DisplayText weight="bold" style={styles.previewIconText}>
                S
              </DisplayText>
            </View>
            <View style={styles.previewBody}>
              <Text style={[styles.previewApp, { color: theme.sub }]}>{t("onboarding.notificationPreview")}</Text>
              <Text style={[styles.previewText, { color: theme.ink }]}>{SAMPLE}</Text>
            </View>
          </View>
        </FadeInView>
      )}

      <FadeInView delay={compact ? 0 : 140}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: theme.sub }]}>{t("onboarding.howMany")}</Text>
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <DisplayText weight="bold" style={[styles.count, { color: theme.accent }]}>
                {settings.count}×
              </DisplayText>
            </Animated.View>
          </View>

          <Slider
            minimumValue={1}
            maximumValue={MAX_PER_DAY}
            step={1}
            value={settings.count}
            onValueChange={setCount}
            // Commit on release, so a settings screen saves once rather than on
            // every tick of the drag.
            onSlidingComplete={(count) =>
              onCommit?.({ ...settings, count: Math.round(count) })
            }
            disabled={disabled}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.accent}
            accessibilityLabel={t("onboarding.remindersPerDay")}
          />

          <View style={styles.scaleRow}>
            <Text style={[styles.scaleText, { color: theme.sub }]}>1</Text>
            <Text style={[styles.scaleText, { color: theme.sub }]}>{MAX_PER_DAY}</Text>
          </View>
        </View>
      </FadeInView>

      <FadeInView delay={220}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <TimeRow which="start" label={t("onboarding.startAt")} />
          <View style={[styles.divider, { backgroundColor: theme.border, opacity: 0.4 }]} />
          <TimeRow which="end" label={t("onboarding.endAt")} />
        </View>
      </FadeInView>
    </View>
  );
};

export default ReminderSetup;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  previewIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  previewIconText: {
    color: colors.white,
    fontSize: 20,
  },
  previewBody: {
    flex: 1,
  },
  previewApp: {
    fontSize: 12,
    color: colors.mauveDeep,
    marginBottom: 2,
  },
  previewText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardLabel: {
    ...type.label,
    fontSize: 15,
  },
  count: {
    fontSize: 22,
    color: colors.coral,
  },
  scaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scaleText: {
    fontSize: 12,
    color: colors.inkFaint,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  timeLabel: {
    ...type.label,
    fontSize: 15,
  },
  timeChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  timeChipText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(122,90,112,0.15)",
    marginVertical: spacing.sm,
  },
});
