import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import OfflineBanner from "../../components/OfflineBanner";
import ProfileNudge from "../../components/ProfileNudge.jsx";
import FloatingChrome from "../../components/FloatingChrome.jsx";
import AffirmationFeed from "../../components/AffirmationFeed.jsx";
import StreakToast from "../../components/StreakToast.jsx";
import VerifyEmailCard from "../../components/VerifyEmailCard.jsx";
import { useFeed } from "../../hooks/useFeed.js";
import { useFavorites } from "../../hooks/useFavorites.js";
import { useStreak } from "../../hooks/useStreak.js";
import { useReminders } from "../../hooks/useReminders.js";
import { useProfileNudge } from "../../hooks/useProfileNudge.js";
import { useSubscription } from "../../hooks/useSubscription.js";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { syncWidget } from "../../lib/widget.js";
import { spacing } from "../../theme/tokens.js";

/**
 * Today: the feed, with the app's controls floating over it.
 *
 * This used to be one line on a scrolling page. It is now the affirmation feed
 * itself — one line per screen, swiped — because a single line above a dead
 * bottom half read as an app that had stopped working. Whose words are in the
 * feed is the server's decision: the curated bank if they are free, a batch
 * written for them if they subscribe.
 *
 * The *daily* line has not gone anywhere, it just stopped being this screen. It
 * is still what the home-screen widget renders, what a reminder carries, and
 * what the streak counts — which is why `useFeed` is still here, doing all of
 * that while rendering none of it.
 */
const Dashboard = () => {
  const router = useRouter();
  const { entries, todayEntry, today, offline, markSeen } = useFeed();
  const { favorites } = useFavorites();
  const { entitled } = useSubscription();
  const { streak, refresh: refreshStreak } = useStreak();
  const { resync: resyncReminders } = useReminders();
  const nudge = useProfileNudge();
  const { theme } = useAppTheme();

  const [showStreak, setShowStreak] = useState(false);

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
      markSeen()
        .then(refreshStreak)
        .then(() => setShowStreak(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntry?.date]);

  return (
    <AffirmationFeed
      chrome={
        <>
          <OfflineBanner visible={offline} />

          <StreakToast
            streak={streak}
            visible={showStreak}
            onHide={() => setShowStreak(false)}
          />

          {/* The app's controls, floating over the line rather than framing it —
              see components/FloatingChrome.jsx for what the old bars cost. */}
          <FloatingChrome
            kept={favorites.length}
            entitled={entitled}
            onProfile={() => router.push("/profile")}
            onPremium={() => router.push("/billing")}
            onCategories={() => router.push("/favorites")}
            onPractice={() => router.push("/practice")}
            onThemes={() => router.push("/themes")}
          />

          {/* Both used to sit below the affirmation on a scrolling page. The
              page is one line per screen now, so they float above the feed
              instead — still never covering the line, and still absent
              entirely until there is something to ask. */}
          <View style={styles.overlayCards} pointerEvents="box-none">
            <VerifyEmailCard compact />

            <ProfileNudge
              suggestion={nudge.suggestion}
              completeness={nudge.completeness}
              onAnswer={nudge.answer}
              onDismiss={nudge.dismiss}
            />
          </View>
        </>
      }
    />
  );
};

export default Dashboard;

const styles = StyleSheet.create({
  /**
   * Below the top chrome row, in the empty space above the line.
   *
   * These sat at the bottom first, which put a tall card straight over the
   * feed's own controls — share, heart and bookmark rendered *through* it — and,
   * worse, over the lower half of the screen, where a swipe naturally starts. A
   * card is a real touch target however `box-none` its container is, so a swipe
   * beginning on it never reached the list and the feed looked frozen.
   *
   * The head of the screen is the one region a paged feed leaves genuinely
   * empty: the line is vertically centred and its actions sit under it.
   */
  overlayCards: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 108,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
});
