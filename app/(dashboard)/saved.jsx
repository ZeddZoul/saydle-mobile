import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import GradientBackground from "../../components/GradientBackground.jsx";
import LineArt from "../../components/LineArt.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import OfflineBanner from "../../components/OfflineBanner";
import Button from "../../components/Button";
import { useSaved } from "../../hooks/useSaved.js";
import { radius, shadow, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";

/**
 * The shelf — where bookmarks land.
 *
 * The feed has offered a bookmark since the library shipped, with a comment
 * promising "a heart is a reaction; a bookmark is an intention." Until this
 * screen, the intention went nowhere: the server kept every save and nothing
 * ever showed them. A control that works and cannot be seen working is
 * indistinguishable from one that doesn't.
 *
 * Deliberately a sibling of Favorites rather than a tab inside it. Collapsing
 * the two into one screen would re-ask the question the two controls answer.
 */
const Saved = () => {
  const { t } = useT();
  const { items, loading, offline, locked, toggle } = useSaved();
  const { theme } = useAppTheme();
  const router = useRouter();

  if (loading) {
    return (
      <GradientBackground style={styles.centered} testID="saved-loading">
        <FloatingHeader title={t("saved.title")} />

        <ActivityIndicator size="large" color={theme.accent} />
      </GradientBackground>
    );
  }

  // Stated plainly rather than hidden: someone who came looking should learn
  // what the shelf is and what unlocks it, not find an empty screen.
  if (locked) {
    return (
      <GradientBackground style={styles.centered} testID="saved-locked">
        <FloatingHeader title={t("saved.title")} />

        <Ionicons name="bookmark-outline" size={30} color={theme.accent} />
        <DisplayText style={[styles.lockedTitle, { color: theme.ink }]}>
          {t("saved.lockedTitle")}
        </DisplayText>
        <Text style={[styles.lockedBody, { color: theme.sub }]}>{t("saved.lockedBody")}</Text>
        <Button
          title={t("saved.lockedCta")}
          onPress={() => router.push("/billing")}
          style={styles.lockedButton}
          testID="saved-upgrade"
        />
      </GradientBackground>
    );
  }

  const remove = (affirmation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggle(affirmation).catch(() => {});
  };

  return (
    <GradientBackground>
      <FloatingHeader title={t("saved.title")} />

      <OfflineBanner visible={offline} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.affirmation.id}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <LineArt name="savedEmpty" size={128} />
            <Text style={[styles.emptyText, { color: theme.sub }]}>{t("saved.empty")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surfaceStrong }]}>
            <DisplayText weight="regular" style={[styles.cardText, { color: theme.ink }]}>
              {item.affirmation.text}
            </DisplayText>
            <Pressable
              onPress={() => remove(item.affirmation)}
              accessibilityRole="button"
              accessibilityLabel={t("saved.remove", { text: item.affirmation.text })}
              hitSlop={10}
              style={styles.mark}
              testID={`saved-remove-${item.affirmation.id}`}
            >
              <Ionicons name="bookmark" size={22} color={theme.accent} />
            </Pressable>
          </View>
        )}
      />
    </GradientBackground>
  );
};

export default Saved;

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  list: {
    padding: spacing.xl,
    // After the shorthand, never before it — the shorthand resets it (see the
    // gotcha in CLAUDE.md). The header floats, so the list reserves its space.
    paddingTop: FLOATING_HEADER_INSET,
    gap: spacing.md,
  },
  emptyList: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  empty: {
    alignItems: "center",
    gap: spacing.lg,
  },
  emptyText: {
    ...type.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 260,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  cardText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
  },
  mark: {
    padding: spacing.xs,
  },
  lockedTitle: {
    fontSize: 22,
    textAlign: "center",
    marginTop: spacing.md,
  },
  lockedBody: {
    ...type.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 280,
    marginTop: spacing.sm,
  },
  lockedButton: {
    marginTop: spacing.xl,
    alignSelf: "stretch",
  },
});
