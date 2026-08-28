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
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import GradientBackground from "./GradientBackground.jsx";
import LineArt from "./LineArt.jsx";
import DisplayText from "./DisplayText.jsx";
import ShareSheet from "./ShareSheet.jsx";
import OfflineBanner from "./OfflineBanner";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useFavorites } from "../hooks/useFavorites.js";
import { useLibrary } from "../hooks/useLibrary.js";
import { useSaved } from "../hooks/useSaved.js";
import { useT } from "../lib/i18n.js";
import { spacing, type } from "../theme/tokens.js";

/**
 * The affirmation feed: one line per screen, swiped rather than scrolled.
 *
 * Paged on purpose. The reader lands on exactly one sentence with nothing
 * beside it to compare it to — a free-scrolling list of two hundred would be
 * something to get through rather than something to sit with.
 *
 * Whose words are in it is decided server-side, not here: a free reader gets
 * the curated bank, a subscriber the batch written for them. Both arrive as
 * the same shape with real ids, so this component never asks which.
 *
 * `chrome` is whatever floats above it — Today passes the full FloatingChrome,
 * anything else passes a FloatingHeader. Keeping that out of here is what lets
 * one implementation serve both without either growing a mode flag.
 */
const Page = ({ item, height, theme, favorited, saved, onFavorite, onSave, onShare, t }) => (
  <View style={[styles.page, { height }]} testID="library-page">
    <DisplayText style={[styles.text, { color: theme.ink }]}>{item.text}</DisplayText>

    <View style={styles.actions}>
      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel={t("today.share")}
        hitSlop={12}
      >
        <Ionicons name="share-outline" size={26} color={theme.sub} />
      </Pressable>

      {/* A heart is a reaction; a bookmark is an intention. Two controls,
          because collapsing them loses which one they meant. */}
      <Pressable
        onPress={onFavorite}
        accessibilityRole="button"
        accessibilityState={{ selected: favorited }}
        accessibilityLabel={t("today.favorite")}
        hitSlop={12}
        testID="library-favorite"
      >
        <Ionicons name={favorited ? "heart" : "heart-outline"} size={28} color={theme.accent} />
      </Pressable>

      <Pressable
        onPress={onSave}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={t("library.save")}
        hitSlop={12}
        testID="library-save"
      >
        <Ionicons
          name={saved ? "bookmark" : "bookmark-outline"}
          size={26}
          color={theme.accent}
        />
      </Pressable>
    </View>
  </View>
);

const AffirmationFeed = ({ chrome }) => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const { height } = useWindowDimensions();

  const library = useLibrary();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const { isSaved, toggle: toggleSaved } = useSaved();

  const [sharing, setSharing] = useState(null);

  /**
   * Page height, in state rather than a ref — and that distinction is the whole
   * bug it fixes.
   *
   * `getItemLayout` tells the list where every page *starts*; the page style
   * says how tall it actually *is*. Held in a ref, the measured height lands
   * without a re-render, so pages already on screen keep the old value while
   * `getItemLayout` starts reporting the new one. The two disagree by the height
   * of the safe area, and because paging accumulates offsets, the content walks
   * further down the screen with every swipe until it leaves entirely.
   *
   * State keeps both readings the same on every render.
   */
  const [pageHeight, setPageHeight] = useState(0);

  /**
   * Refetch when the screen comes back into view.
   *
   * Screens in this navigator stay mounted once visited, so a first visit that
   * landed on "writing your next set…" would sit on that forever — the batch
   * takes about a minute to write, and by the time it lands nothing asks again.
   * Only refetched when there is nothing to show, so returning mid-scroll does
   * not yank the reader back to the top.
   */
  useFocusEffect(
    useCallback(() => {
      if (library.affirmations.length === 0) library.refresh().catch(() => {});
      // Deliberately keyed on emptiness alone: including `library` would refetch
      // on every render the hook produces.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [library.affirmations.length]),
  );

  // Which line they are actually on. Reported to the server debounced, since
  // the cursor is the whole of seen-state.
  const onViewable = useRef(({ viewableItems }) => {
    const last = viewableItems.at(-1);
    if (last) library.markReached(last.index);
  }).current;

  const onLayout = useCallback((event) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    // Guarded so a rotation or keyboard event that reports the same height does
    // not re-render the whole list.
    setPageHeight((current) => (current === measured ? current : measured));
  }, []);

  if (library.locked) {
    return (
      <GradientBackground style={styles.centered} testID="library-locked">
        {chrome}

        <Ionicons name="albums-outline" size={30} color={theme.accent} />
        <DisplayText weight="bold" style={[styles.lockedTitle, { color: theme.ink }]}>
          {t("library.lockedTitle")}
        </DisplayText>
        {/* Stated plainly rather than hidden: someone who came looking should
            learn what it is, not find an empty screen. */}
        <Text style={[styles.lockedBody, { color: theme.sub }]}>{t("library.lockedBody")}</Text>
      </GradientBackground>
    );
  }

  if (library.loading) {
    return (
      <GradientBackground style={styles.centered}>
        {chrome}

        <ActivityIndicator color={theme.accent} testID="library-loading" />
      </GradientBackground>
    );
  }

  if (library.affirmations.length === 0) {
    return (
      <GradientBackground style={styles.centered} testID="library-empty">
        {chrome}

        {/* A page mid-write. The spinner says "working"; this says what the
            work is. */}
        <LineArt name="feedWriting" size={116} />
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.lockedBody, { color: theme.sub }]}>
          {t(library.refilling ? "library.writing" : "library.empty")}
        </Text>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <FlatList
          testID="library-list"
          // Measured on the list itself: its height is exactly the space one
          // page gets, so there is no safe-area arithmetic to get wrong.
          onLayout={onLayout}
          data={library.affirmations}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onEndReached={library.loadMore}
          onEndReachedThreshold={0.6}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, index) => ({
            length: pageHeight || height,
            offset: (pageHeight || height) * index,
            index,
          })}
          renderItem={({ item }) => (
            <Page
              item={item}
              height={pageHeight || height}
              theme={theme}
              t={t}
              favorited={isFavorite(item.id)}
              saved={isSaved(item.id)}
              onShare={() => setSharing(item)}
              onFavorite={() => {
                Haptics.selectionAsync().catch(() => {});
                toggleFavorite(item).catch(() => {});
              }}
              onSave={() => {
                Haptics.selectionAsync().catch(() => {});
                toggleSaved(item).catch(() => {});
              }}
            />
          )}
          ListFooterComponent={
            library.fetching ? <ActivityIndicator color={theme.accent} /> : null
          }
        />
      </SafeAreaView>

      {/* After the list, not before it. Later siblings paint on top in React
          Native, so chrome rendered first would sit *behind* the feed — visible
          but untappable, which reads as controls that have stopped working. */}
      <OfflineBanner visible={library.offline} />
      {chrome}

      <ShareSheet
        visible={Boolean(sharing)}
        affirmation={sharing}
        onClose={() => setSharing(null)}
      />
    </GradientBackground>
  );
};

export default AffirmationFeed;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  page: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  text: {
    ...type.display,
    fontSize: 30,
    lineHeight: 42,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    marginTop: spacing.xxl,
  },
  lockedTitle: { ...type.sectionTitle, fontSize: 22, textAlign: "center" },
  lockedBody: { fontSize: 15, lineHeight: 22, textAlign: "center" },
});
