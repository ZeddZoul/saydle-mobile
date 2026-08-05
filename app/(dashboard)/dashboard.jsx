import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import OfflineBanner from "../../components/OfflineBanner";
import StreakStrip from "../../components/StreakStrip.jsx";
import ProfileNudge from "../../components/ProfileNudge.jsx";
import VerifyEmailCard from "../../components/VerifyEmailCard.jsx";
import Button from "../../components/Button";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useFeed } from "../../hooks/useFeed.js";
import { useFavorites } from "../../hooks/useFavorites.js";
import { useStreak } from "../../hooks/useStreak.js";
import { useReminders } from "../../hooks/useReminders.js";
import { useProfileNudge } from "../../hooks/useProfileNudge.js";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { messageFor } from "../../lib/errors.js";
import { formatFriendlyDate } from "../../lib/dates.js";
import { syncWidget } from "../../lib/widget.js";
import { colors, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";

const Dashboard = () => {
  const { t } = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { entries, todayEntry, today, loading, refreshing, offline, error, refresh, markSeen } =
    useFeed();
  const { isFavorite, toggle } = useFavorites();
  const { streak, refresh: refreshStreak } = useStreak();
  const { resync: resyncReminders } = useReminders();
  const nudge = useProfileNudge();
  const { theme } = useAppTheme();

  // Entrance: the affirmation fades and rises in, so it feels like it arrives
  // rather than just being there.
  const enter = useRef(new Animated.Value(0)).current;
  // A slow, looping breath — the affirmation gently swells and drifts, the way a
  // calm inhale/exhale does. This is what makes the screen feel serene.
  const breathe = useRef(new Animated.Value(0)).current;
  // The heart springs when tapped.
  const heart = useRef(new Animated.Value(1)).current;

  const affirmation = todayEntry?.affirmation;
  const favorited = affirmation ? isFavorite(affirmation.id) : false;

  useEffect(() => {
    if (!affirmation) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [affirmation?.id, enter]);

  // Breathing loop — runs continuously, ~4.5s each way, eased like a real breath.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 4500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 4500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const enterRise = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.022] });
  const floatY = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const quoteOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.65] });

  // Re-schedule reminders whenever the cached feed changes, so a queued
  // notification never carries a stale affirmation. The home-screen widget gets
  // the same treatment, and for the same reason — both render without us.
  useEffect(() => {
    if (entries.length === 0) return;
    resyncReminders();
    syncWidget({ entries, theme, today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, entries[0]?.date, theme.slug, today]);

  // Mark the day read once, when it first appears — then refresh the streak so
  // today's dot fills in without waiting for a reload.
  useEffect(() => {
    if (todayEntry && !todayEntry.seenAt) {
      markSeen().then(refreshStreak);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntry?.date]);

  const onFavorite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    heart.setValue(0.7);
    Animated.spring(heart, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
    toggle(affirmation);
  };

  const onShare = () => {
    Haptics.selectionAsync().catch(() => {});
    Share.share({ message: `${affirmation.text}\n\n— Saydle` }).catch(() => {});
  };

  if (loading) {
    return (
      <GradientBackground colors={theme.gradient} style={styles.centered} testID="feed-loading">
        <ActivityIndicator size="large" color={theme.accent} />
      </GradientBackground>
    );
  }

  return (
    <GradientBackground colors={theme.gradient}>
      <OfflineBanner visible={offline} />

      {/* Pinned above the scroll area so the affirmation stays centred below it. */}
      <View style={styles.streakArea}>
        <StreakStrip streak={streak} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} />
        }
      >
        <Text style={[styles.greeting, { color: theme.sub }]}>
          {user?.firstName
            ? t("today.greeting", { name: user.firstName })
            : t("today.greetingAnonymous")}
        </Text>
        <Text style={[styles.date, { color: theme.sub }]}>{formatFriendlyDate(today)}</Text>

        {affirmation ? (
          <Animated.View
            style={[styles.affirmationWrap, { opacity: enter, transform: [{ translateY: enterRise }] }]}
          >
            <Animated.View
              style={[styles.breath, { transform: [{ scale: breatheScale }, { translateY: floatY }] }]}
            >
              <Animated.Text style={[styles.quote, { color: theme.accent, opacity: quoteOpacity }]}>
                &ldquo;
              </Animated.Text>
              {/* Tapping the line opens the immersive stream — the affirmation
                  itself is the way in, rather than a button competing with it. */}
              <Pressable
                onPress={() => router.push("/stream")}
                accessibilityRole="button"
                accessibilityLabel={t("stream.open")}
                testID="open-stream"
              >
                <DisplayText style={[styles.affirmation, { color: theme.ink }]}>
                  {affirmation.text}
                </DisplayText>
              </Pressable>
            </Animated.View>

            <View style={styles.actions}>
              <Pressable
                onPress={onShare}
                accessibilityRole="button"
                accessibilityLabel={t("today.share")}
                style={styles.actionButton}
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={24} color={theme.sub} />
              </Pressable>

              <Animated.View style={{ transform: [{ scale: heart }] }}>
                <Pressable
                  onPress={onFavorite}
                  accessibilityRole="button"
                  accessibilityLabel={t(favorited ? "today.unsave" : "today.save")}
                  accessibilityState={{ selected: favorited }}
                  style={styles.actionButton}
                  hitSlop={8}
                >
                  <Ionicons
                    name={favorited ? "heart" : "heart-outline"}
                    size={30}
                    color={theme.accent}
                  />
                </Pressable>
              </Animated.View>
            </View>
          </Animated.View>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.sub }]}>
              {error
                ? messageFor(error)
                : t("today.empty")}
            </Text>
            <Button title={t("common.tryAgain")} onPress={refresh} variant="secondary" />
          </View>
        )}

        {/* Both live below the affirmation, never above it — the day's line is
            why they opened the app, and it stays the first thing they read. */}
        <VerifyEmailCard style={styles.card} />

        <ProfileNudge
          suggestion={nudge.suggestion}
          completeness={nudge.completeness}
          onAnswer={nudge.answer}
          onDismiss={nudge.dismiss}
        />
      </ScrollView>
    </GradientBackground>
  );
};

export default Dashboard;

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginTop: spacing.xxl,
  },
  streakArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  greeting: {
    fontSize: 15,
    color: colors.inkSoft,
  },
  date: {
    fontSize: 13,
    color: colors.mauveDeep,
    marginTop: 2,
    marginBottom: spacing.xxl,
  },
  affirmationWrap: {
    alignItems: "center",
  },
  breath: {
    alignItems: "center",
  },
  quote: {
    fontFamily: type.affirmation.fontFamily,
    fontSize: 64,
    lineHeight: 64,
    color: colors.coral,
    height: 44,
  },
  affirmation: {
    ...type.affirmation,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    marginTop: spacing.xxl,
  },
  actionButton: {
    padding: spacing.sm,
  },
  empty: {
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...type.subtitle,
    textAlign: "center",
  },
});
