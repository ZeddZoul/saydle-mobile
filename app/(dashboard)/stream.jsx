import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackground from "../../components/GradientBackground.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import ShareSheet from "../../components/ShareSheet.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useFavorites } from "../../hooks/useFavorites.js";
import { useStream } from "../../hooks/useStream.js";
import { useT } from "../../lib/i18n.js";
import { formatFriendlyDate } from "../../lib/dates.js";
import { spacing, type } from "../../theme/tokens.js";

/**
 * The immersive full-screen feed: one affirmation per screen, swiped vertically.
 *
 * Paging rather than free scrolling is the whole point — the reader always
 * lands on exactly one line, with nothing else on screen to compare it to. A
 * scrollable list would turn a sentence to sit with into an inbox.
 *
 * It runs today-first and then backwards through days already read; see
 * hooks/useStream.js for why it never runs forward.
 */
const StreamPage = ({ entry, isToday, height, onFavorite, onShare, favorited, theme, t }) => (
  <View style={[styles.page, { height }]} testID="stream-page">
    <Text style={[styles.date, { color: theme.sub }]}>
      {isToday ? t("stream.today") : formatFriendlyDate(entry.date)}
    </Text>

    <DisplayText style={[styles.affirmation, { color: theme.ink }]} accessibilityRole="text">
      {entry.affirmation.text}
    </DisplayText>

    <View style={styles.actions}>
      <Pressable
        onPress={() => onShare(entry)}
        accessibilityRole="button"
        accessibilityLabel={t("today.share")}
        hitSlop={10}
        style={styles.action}
      >
        <Ionicons name="share-outline" size={24} color={theme.sub} />
      </Pressable>

      <Pressable
        onPress={() => onFavorite(entry.affirmation)}
        accessibilityRole="button"
        accessibilityLabel={t(favorited ? "today.unsave" : "today.save")}
        accessibilityState={{ selected: favorited }}
        hitSlop={10}
        style={styles.action}
      >
        <Ionicons name={favorited ? "heart" : "heart-outline"} size={30} color={theme.accent} />
      </Pressable>
    </View>
  </View>
);

const Stream = () => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { entries, today, loading, fetching, loadMore } = useStream();
  const { isFavorite, toggle } = useFavorites();
  const [shareEntry, setShareEntry] = useState(null);

  // Each page is exactly one screen, so paging maths never drifts.
  const pageHeight = useRef(height).current;

  const onFavorite = useCallback(
    (affirmation) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      toggle(affirmation);
    },
    [toggle],
  );

  const onShare = useCallback((entry) => {
    Haptics.selectionAsync().catch(() => {});
    setShareEntry(entry);
  }, []);

  const renderItem = useCallback(
    ({ item }) => (
      <StreamPage
        entry={item}
        isToday={item.date === today}
        height={pageHeight}
        theme={theme}
        t={t}
        favorited={isFavorite(item.affirmation.id)}
        onFavorite={onFavorite}
        onShare={onShare}
      />
    ),
    [today, pageHeight, theme, t, isFavorite, onFavorite, onShare],
  );

  if (loading && entries.length === 0) {
    return (
      <GradientBackground style={styles.centered} testID="stream-loading">
        <ActivityIndicator size="large" color={theme.accent} />
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.date}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        // Fixed-height pages, so the list can jump without measuring.
        getItemLayout={(_, index) => ({
          length: pageHeight,
          offset: pageHeight * index,
          index,
        })}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          fetching ? (
            <View style={[styles.footer, { height: pageHeight / 4 }]}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null
        }
        testID="stream-list"
      />

      <SafeAreaView style={styles.closeArea} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("stream.close")}
          hitSlop={12}
          style={styles.close}
          testID="stream-close"
        >
          <Ionicons name="chevron-down" size={26} color={theme.sub} />
        </Pressable>
      </SafeAreaView>

      <ShareSheet
        visible={Boolean(shareEntry)}
        affirmation={shareEntry?.affirmation}
        date={shareEntry?.date}
        onClose={() => setShareEntry(null)}
      />
    </GradientBackground>
  );
};

export default Stream;

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  date: {
    fontSize: 13,
    marginBottom: spacing.xl,
  },
  affirmation: {
    ...type.affirmation,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    marginTop: spacing.xxl,
  },
  action: {
    padding: spacing.sm,
  },
  footer: {
    alignItems: "center",
    justifyContent: "center",
  },
  closeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  close: {
    padding: spacing.md,
  },
});
