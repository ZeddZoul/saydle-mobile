import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import GradientBackground from "../../components/GradientBackground.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Button from "../../components/Button";
import PracticeRing from "../../components/PracticeRing.jsx";
import PracticeWeek from "../../components/PracticeWeek.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useFeed } from "../../hooks/useFeed.js";
import { useFavorites } from "../../hooks/useFavorites.js";
import { useCustomAffirmations } from "../../hooks/useCustomAffirmations.js";
import { usePractice } from "../../hooks/usePractice.js";
import { useLibrary } from "../../hooks/useLibrary.js";
import { useBreath } from "../../hooks/useBreath.js";
import { useVoiceNote } from "../../hooks/useVoiceNote.js";
import { usePracticeSession } from "../../hooks/usePracticeSession.js";
import { useVoicePreference } from "../../hooks/useVoicePreference.js";
import ListeningSession from "../../components/ListeningSession.jsx";
import VoiceSheet from "../../components/VoiceSheet.jsx";
import ShareSheet from "../../components/ShareSheet.jsx";
import { useT } from "../../lib/i18n.js";
import { radius, spacing, type } from "../../theme/tokens.js";

/**
 * Practice: say a line to yourself, a few times, on purpose.
 *
 * One object, not a stack of them. The affirmation sits inside a ring whose
 * segments fill as you say it, so the words, the progress and the tap target
 * are the same thing — the previous layout put a "0 of 7" scoreboard above the
 * line and a row of small dots below it, which left the screen with no centre
 * and nothing that looked touchable.
 *
 * Two things here are what a widget-and-notification app structurally cannot
 * do. You choose what to work on, so practice is never a dead end waiting on
 * today's feed. And guided mode paces you — the disc inside the ring breathes,
 * each cycle counts a rep, your hands stay free.
 *
 * Still no timer, and still no way to go past the target: a ritual with an end,
 * not a score to maximise.
 */
const SOURCES = ["today", "saved", "mine"];

const Practice = () => {
  const { t } = useT();
  const listenSession = usePracticeSession();
  const [listening, setListening] = useState(false);
  const [pickingVoice, setPickingVoice] = useState(false);
  const [sharingSession, setSharingSession] = useState(false);
  const voicePref = useVoicePreference();
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const { todayEntry, loading: feedLoading } = useFeed();
  const { favorites } = useFavorites();
  const { affirmations: mine } = useCustomAffirmations();
  // The library keeps "another line" honest. Without it the Today pool is one
  // line deep, so finishing a session and asking for another handed back the
  // same sentence — which read as the screen being broken rather than done.
  const { affirmations: libraryLines } = useLibrary();

  const [source, setSource] = useState("today");
  const [index, setIndex] = useState(0);
  const [guided, setGuided] = useState(false);

  const pools = useMemo(() => {
    const daily = todayEntry?.affirmation ? [todayEntry.affirmation] : [];
    // Today first — it is the ritual — then the library behind it, deduped so
    // the daily line cannot appear twice in one session.
    const extras = libraryLines.filter((a) => a.id !== todayEntry?.affirmation?.id);
    return {
      today: [...daily, ...extras],
      saved: favorites.map((f) => f.affirmation),
      mine: mine ?? [],
    };
  }, [todayEntry, favorites, mine, libraryLines]);

  // Fall back to whatever pool actually has something: "open Today first" was a
  // dead end for anyone who already had a favourite saved.
  const effectiveSource = pools[source]?.length
    ? source
    : (SOURCES.find((key) => pools[key].length) ?? source);

  const pool = pools[effectiveSource] ?? [];
  const affirmation = pool[index % Math.max(pool.length, 1)] ?? null;

  const { session, complete, streak, history, today, rep, reset } = usePractice(affirmation);
  const voice = useVoiceNote(affirmation?.id);

  const press = useRef(new Animated.Value(1)).current;
  const done = useRef(new Animated.Value(0)).current;

  const bump = useCallback(() => {
    press.setValue(0.97);
    Animated.spring(press, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 10,
    }).start();
    rep();
  }, [press, rep]);

  const breath = useBreath(guided && !complete, bump);

  useEffect(() => {
    if (!complete) return;
    setGuided(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.timing(done, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [complete, done]);

  const onTap = () => {
    if (complete || guided) return; // guided mode counts for you
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    bump();
  };

  const onRecord = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (voice.recording) return void (await voice.stop());
    await voice.start();
  };

  const onPlay = () => {
    Haptics.selectionAsync().catch(() => {});
    voice.play();
  };

  if (feedLoading && !affirmation) {
    return (
      <GradientBackground style={styles.centered}>
        <FloatingHeader title={t("tabs.practice")} />
        <Text style={[styles.hint, { color: theme.sub }]}>{t("practice.loading")}</Text>
      </GradientBackground>
    );
  }

  if (!affirmation) {
    return (
      <GradientBackground style={styles.centered}>
        <FloatingHeader title={t("tabs.practice")} />
        <Text style={[styles.hint, { color: theme.sub }]}>{t("practice.nothing")}</Text>
      </GradientBackground>
    );
  }

  const target = session?.target ?? 0;
  const count = session?.count ?? 0;
  const sources = SOURCES.filter((key) => pools[key].length);

  /**
   * The listening session owns the screen outright while it runs.
   *
   * Not a modal over the practice screen: the whole point is that nothing
   * competes with the line, and a header, a ring and a week strip behind a
   * scrim are still things competing with it.
   */
  if (listening && listenSession.ready) {
    return (
      <GradientBackground>
        <ListeningSession
          lines={listenSession.lines}
          voice={voicePref.voice.speech}
          onClose={() => setListening(false)}
          onFinish={() => {
            // A finished session counts as practice for the day — the streak
            // has always measured "you did this today", and this is the doing.
            rep();
            setListening(false);
          }}
        />
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <FloatingHeader title={t("tabs.practice")} />

      <Pressable
        onPress={onTap}
        disabled={complete}
        accessibilityRole="button"
        accessibilityLabel={t("practice.tapLabel", { count, target })}
        accessibilityHint={complete ? undefined : t("practice.tapHint")}
        style={styles.surface}
        testID="practice-surface"
      >
        {/* The listening session, offered first — it is what Practice is
            becoming. The tap-to-say ritual below it still works and still
            feeds the same streak; the two are different ways to sit with the
            same lines rather than one replacing the other today. */}
        {listenSession.ready ? (
          <>
            <Button
              title={t("practice.listen")}
              onPress={() => setListening(true)}
              style={styles.listen}
              testID="practice-listen"
            />

            {/* Named rather than labelled "Voice", so the choice already made
                is visible without opening anything. */}
            <Pressable
              onPress={() => setPickingVoice(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("voices.change")}
              style={styles.voiceRow}
              testID="practice-voice"
            >
              <Ionicons name="volume-medium-outline" size={14} color={theme.sub} />
              <Text style={[styles.voiceLabel, { color: theme.sub }]}>
                {voicePref.pending
                  ? t("voices.pendingRow", {
                      name: t(`voices.${voicePref.pending}.name`),
                    })
                  : t("voices.activeRow", {
                      name: t(`voices.${voicePref.active}.name`),
                    })}
              </Text>
            </Pressable>

            {/* The seven are the shareable object, not one line pulled out of
                them — which is also the only thing worth making a video of. */}
            <Pressable
              onPress={() => setSharingSession(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("practice.shareSession")}
              style={styles.voiceRow}
              testID="practice-share-session"
            >
              <Ionicons name="share-outline" size={14} color={theme.sub} />
              <Text style={[styles.voiceLabel, { color: theme.sub }]}>
                {t("practice.shareSession")}
              </Text>
            </Pressable>
          </>
        ) : null}

        {sources.length > 1 && (
          <View style={styles.sources} testID="practice-sources">
            {sources.map((key) => {
              const on = key === effectiveSource;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    setSource(key);
                    setIndex(0);
                    setGuided(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.chip,
                    { borderColor: on ? theme.accent : theme.border },
                    on && { backgroundColor: theme.accent },
                  ]}
                >
                  <Text style={[styles.chipText, { color: on ? theme.surface : theme.sub }]}>
                    {t(`practice.source.${key}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <PracticeRing target={target} count={count} breath={guided ? breath.scale : null}>
          <Animated.View style={{ transform: [{ scale: press }] }}>
            <DisplayText style={[styles.affirmation, { color: theme.ink }]}>
              {affirmation.text}
            </DisplayText>
          </Animated.View>
        </PracticeRing>

        {/* One line under the ring, and only one: the count when you're going,
            the breath phase when it's pacing you, the result when you're done. */}
        <View style={styles.caption}>
          {complete ? (
            <Animated.View style={[styles.done, { opacity: done }]} testID="practice-done">
              <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
              <Text style={[styles.doneText, { color: theme.ink }]}>
                {user?.firstName
                  ? t("practice.doneNamed", { name: user.firstName })
                  : t("practice.done")}
              </Text>
              {streak > 1 ? (
                <Text style={[styles.hint, { color: theme.sub }]}>
                  {t("practice.streak", { count: streak })}
                </Text>
              ) : null}
              <View style={styles.doneActions}>
                <Button title={t("practice.again")} variant="secondary" onPress={reset} />
                {pool.length > 1 && (
                  <Button
                    title={t("practice.next")}
                    variant="secondary"
                    onPress={() => setIndex((i) => (i + 1) % pool.length)}
                  />
                )}
              </View>
            </Animated.View>
          ) : (
            <>
              <Text style={[styles.eyebrow, { color: theme.ink }]}>
                {t("practice.eyebrow", { count, target })}
              </Text>
              <Text style={[styles.instruction, { color: theme.sub }]}>
                {breath.label ? t(breath.label) : t("practice.instruction")}
              </Text>
            </>
          )}
        </View>
      </Pressable>

      <View style={styles.controls} pointerEvents="box-none">
        {!complete && (
          <View style={styles.pills}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setGuided((g) => !g);
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: guided }}
              accessibilityLabel={t("practice.guided")}
              testID="practice-guided"
              style={[
                styles.pill,
                { borderColor: guided ? theme.accent : theme.border },
                guided && { backgroundColor: theme.accent },
              ]}
            >
              <Ionicons
                name={guided ? "pause" : "play"}
                size={15}
                color={guided ? theme.surface : theme.ink}
              />
              <Text style={[styles.pillText, { color: guided ? theme.surface : theme.ink }]}>
                {guided ? t("practice.guidedStop") : t("practice.guided")}
              </Text>
            </Pressable>

            {/* Record and play are separate controls on purpose: one pill
                doing both branched on a state that lags, so the tap meant to
                play back started another take instead. */}
            <Pressable
              onPress={onRecord}
              accessibilityRole="button"
              accessibilityLabel={
                voice.recording
                  ? t("practice.voiceStop")
                  : voice.hasNote
                    ? t("practice.voiceRedo")
                    : t("practice.voiceRecord")
              }
              testID="practice-voice"
              style={[
                styles.pill,
                { borderColor: voice.recording ? theme.accent : theme.border },
                voice.recording && { backgroundColor: theme.accent },
              ]}
            >
              <Ionicons
                name={voice.recording ? "stop" : "mic-outline"}
                size={15}
                color={voice.recording ? theme.surface : theme.ink}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: voice.recording ? theme.surface : theme.ink },
                ]}
              >
                {voice.recording
                  ? `${Math.floor((voice.elapsed ?? 0) / 1000)}s`
                  : voice.hasNote
                    ? t("practice.voiceRedo")
                    : t("practice.voiceRecord")}
              </Text>
            </Pressable>

            {voice.hasNote && !voice.recording && (
              <Pressable
                onPress={onPlay}
                onLongPress={voice.discard}
                accessibilityRole="button"
                accessibilityLabel={t("practice.voicePlay")}
                accessibilityHint={t("practice.voiceDiscardHint")}
                testID="practice-voice-play"
                style={[styles.pill, { borderColor: theme.border }]}
              >
                <Ionicons name="volume-medium" size={15} color={theme.ink} />
                <Text style={[styles.pillText, { color: theme.ink }]}>
                  {t("practice.voicePlay")}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {voice.denied && (
          <Text style={[styles.denied, { color: theme.sub }]}>{t("practice.voiceDenied")}</Text>
        )}

        <PracticeWeek history={history} today={today} />

        <ShareSheet
          visible={sharingSession}
          affirmation={listenSession.lines?.[0] ?? null}
          lines={listenSession.lines}
          onClose={() => setSharingSession(false)}
        />

        <VoiceSheet
          visible={pickingVoice}
          active={voicePref.active}
          pending={voicePref.pending}
          onChoose={voicePref.choose}
          onClose={() => setPickingVoice(false)}
        />
      </View>
    </GradientBackground>
  );
};

export default Practice;

const styles = StyleSheet.create({
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  voiceLabel: { ...type.body, fontSize: 13 },
  listen: { marginBottom: spacing.lg },
  centered: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  surface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    // The header floats over this rather than occupying space above it, so the
    // room it needs has to be reserved here. Without this the listen button
    // sits on top of the word "Practice".
    paddingTop: FLOATING_HEADER_INSET,
    // Clears the controls and week strip pinned to the bottom.
    paddingBottom: 150,
  },
  sources: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { ...type.body, fontSize: 12 },
  affirmation: { ...type.affirmation, fontSize: 26, lineHeight: 34, textAlign: "center" },
  caption: { alignItems: "center", marginTop: spacing.xl, minHeight: 64 },
  eyebrow: { ...type.body, fontSize: 15, letterSpacing: 0.4 },
  instruction: { ...type.body, fontSize: 13, marginTop: spacing.xs, textAlign: "center" },
  done: { alignItems: "center", gap: spacing.md },
  doneActions: { flexDirection: "row", gap: spacing.sm },
  doneText: { ...type.subtitle, textAlign: "center" },
  hint: { ...type.subtitle, textAlign: "center" },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 34,
    alignItems: "center",
    gap: spacing.md,
  },
  pills: { flexDirection: "row", gap: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 118,
  },
  pillText: { ...type.body, fontSize: 13 },
  denied: { ...type.body, fontSize: 11, textAlign: "center", paddingHorizontal: spacing.xl },
});
