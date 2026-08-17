import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import GradientBackground from "../../components/GradientBackground.jsx";
import LineArt from "../../components/LineArt.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Button from "../../components/Button";
import OfflineBanner from "../../components/OfflineBanner";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useCustomAffirmations } from "../../hooks/useCustomAffirmations.js";
import { messageFor } from "../../lib/errors.js";
import { useT } from "../../lib/i18n.js";
import { colors, radius, shadow, spacing, type } from "../../theme/tokens.js";

const MAX_LENGTH = 200;

/**
 * "My words" — affirmations the reader writes themselves.
 *
 * Their sentence is not held to the voice rules a generated line is: those
 * exist to keep a model in line, and applying them here would be correcting
 * someone's private words to themselves. The only thing the server refuses is
 * crisis language, and it says why.
 */
const MyWords = () => {
  const { t } = useT();
  const { theme } = useAppTheme();
  const toast = useToast();
  const { affirmations, entitled, loading, offline, saving, create, remove, refresh } =
    useCustomAffirmations();

  // Tab screens stay mounted once visited, so without this the gate would keep
  // showing the paywall after a trial or subscription started elsewhere.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const onSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      await create(trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setText("");
      toast.success(t("myWords.saved"));
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  const onDelete = (affirmation) => {
    Alert.alert(t("myWords.deleteTitle"), affirmation.text, [
      { text: t("profile.cancel"), style: "cancel" },
      {
        text: t("profile.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await remove(affirmation.id);
          } catch (err) {
            toast.error(messageFor(err));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <GradientBackground style={styles.centered} testID="my-words-loading">
        <FloatingHeader title={t("myWords.title")} />

        <ActivityIndicator size="large" color={theme.accent} />
      </GradientBackground>
    );
  }

  // The gate is stated plainly rather than by hiding the feature: someone who
  // came looking should learn what it is, not find an empty screen.
  if (!entitled) {
    return (
      <GradientBackground style={styles.centered} testID="my-words-locked">
        <FloatingHeader title={t("myWords.title")} />

        <Ionicons name="create-outline" size={30} color={theme.accent} />
        <DisplayText style={[styles.lockedTitle, { color: theme.ink }]}>
          {t("myWords.lockedTitle")}
        </DisplayText>
        <Text style={[styles.lockedBody, { color: theme.sub }]}>{t("myWords.lockedBody")}</Text>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <FloatingHeader title={t("myWords.title")} />

      <OfflineBanner visible={offline} />

      <FlatList
        data={affirmations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.composer}>
            <Text style={[styles.prompt, { color: theme.sub }]}>{t("myWords.prompt")}</Text>

            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              multiline
              maxLength={MAX_LENGTH}
              editable={!saving}
              placeholder={t("myWords.placeholder")}
              placeholderTextColor={colors.inkFaint}
              accessibilityLabel={t("myWords.label")}
              style={[styles.input, { color: theme.ink }, focused && styles.inputFocused]}
            />

            <Button
              title={t("myWords.save")}
              onPress={onSave}
              disabled={saving || text.trim().length === 0}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <LineArt name="wordsEmpty" size={124} />
            <Text style={[styles.empty, { color: theme.sub }]}>{t("myWords.empty")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface }]} testID="my-word">
            <DisplayText style={[styles.cardText, { color: theme.ink }]}>
              {item.text}
            </DisplayText>

            <Pressable
              onPress={() => onDelete(item)}
              accessibilityRole="button"
              accessibilityLabel={t("myWords.delete", { text: item.text })}
              hitSlop={10}
              style={styles.delete}
            >
              <Ionicons name="trash-outline" size={18} color={theme.sub} />
            </Pressable>
          </View>
        )}
      />
    </GradientBackground>
  );
};

export default MyWords;

const styles = StyleSheet.create({
  emptyWrap: { alignItems: "center", marginTop: spacing.xl },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  lockedTitle: {
    fontSize: 22,
    textAlign: "center",
  },
  lockedBody: {
    ...type.subtitle,
    textAlign: "center",
  },
  list: {
    padding: spacing.xl,
    paddingBottom: 112,
    // Clears the floating header, which overlays rather than occupies.
    // Declared after any `padding` shorthand: that shorthand resets
    // paddingTop, so ordering here is load-bearing.
    paddingTop: FLOATING_HEADER_INSET,
  },
  composer: {
    marginBottom: spacing.xl,
  },
  prompt: {
    ...type.subtitle,
    marginBottom: spacing.md,
  },
  input: {
    fontSize: 18,
    lineHeight: 26,
    minHeight: 110,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.2)",
    textAlignVertical: "top",
    marginBottom: spacing.lg,
  },
  inputFocused: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  cardText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
  },
  delete: {
    padding: spacing.xs,
  },
  empty: {
    ...type.subtitle,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
