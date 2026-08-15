import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import GradientBackground from "../../components/GradientBackground.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import OfflineBanner from "../../components/OfflineBanner";
import { useFavorites } from "../../hooks/useFavorites.js";
import { colors, radius, shadow, spacing, type } from "../../theme/tokens.js";
import { useT } from "../../lib/i18n.js";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";

const Favorites = () => {
  const { t } = useT();
  const { favorites, loading, offline, toggle } = useFavorites();
  const { theme } = useAppTheme();

  if (loading) {
    return (
      <GradientBackground style={styles.centered} testID="favorites-loading">
        <FloatingHeader title={t("tabs.favorites")} />

        <ActivityIndicator size="large" color={theme.accent} />
      </GradientBackground>
    );
  }

  const remove = (affirmation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggle(affirmation);
  };

  return (
    <GradientBackground>
      <FloatingHeader title={t("tabs.favorites")} />

      <OfflineBanner visible={offline} />

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.affirmation.id}
        contentContainerStyle={favorites.length === 0 ? styles.emptyList : styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyBadge, { backgroundColor: theme.surfaceStrong }]}>
              <Ionicons name="heart-outline" size={34} color={theme.accent} />
            </View>
            <Text style={[styles.emptyText, { color: theme.sub }]}>{t("favorites.empty")}</Text>
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
              accessibilityLabel={t("favorites.remove", { text: item.affirmation.text })}
              hitSlop={10}
              style={styles.heart}
            >
              <Ionicons name="heart" size={22} color={theme.accent} />
            </Pressable>
          </View>
        )}
      />
    </GradientBackground>
  );
};

export default Favorites;

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    // Clears the floating header, which overlays rather than occupies.
    // Declared after any `padding` shorthand: that shorthand resets
    // paddingTop, so ordering here is load-bearing.
    paddingTop: FLOATING_HEADER_INSET,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    ...shadow.card,
  },
  cardText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  heart: {
    padding: spacing.xs,
  },
  empty: {
    alignItems: "center",
    gap: spacing.lg,
  },
  emptyBadge: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.soft,
  },
  emptyText: {
    ...type.subtitle,
    textAlign: "center",
    maxWidth: 280,
  },
});
