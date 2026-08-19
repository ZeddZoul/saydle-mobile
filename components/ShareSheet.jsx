import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import ShareCard, { RATIOS } from "./ShareCard.jsx";
import Button from "./Button.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { THEMES, getTheme } from "../theme/themes.js";
import StoryFrames from "./StoryFrames.jsx";
import { shareCard } from "../lib/shareImage.js";
import { exportStory, shareVideo, videoShareAvailable } from "../lib/videoStory.js";
import { useT } from "../lib/i18n.js";
import { colors, radius, spacing, type } from "../theme/tokens.js";

/**
 * Compose and send a shareable card.
 *
 * The reader picks a look before sending — the same six themes the app ships,
 * not a separate share-only palette, so what they post is recognisably the
 * product they use. Their own theme is where it opens; changing it here is for
 * this one card and never touches their settings.
 *
 * Given several lines it can also send a video: the same cards, in order, held
 * long enough to read. That is only offered on a build that can actually encode
 * one — the module is native, so `videoShareAvailable()` is false in Expo Go and
 * the option simply is not there rather than failing when tapped.
 */
const ShareSheet = ({ visible, affirmation, lines = null, date, onClose }) => {
  const { t } = useT();
  const { theme: appTheme } = useAppTheme();
  const { width } = useWindowDimensions();

  const cardRef = useRef(null);
  const [slug, setSlug] = useState(appTheme.slug);
  const [ratio, setRatio] = useState(RATIOS.square);
  const [busy, setBusy] = useState(false);
  const [asVideo, setAsVideo] = useState(false);

  // A video needs more than one line to be worth the name, and a build that can
  // encode it. Computed once so the toggle cannot appear and vanish mid-sheet.
  const canVideo = useMemo(
    () => Boolean(lines?.length > 1) && videoShareAvailable(),
    [lines?.length],
  );

  // One ref per line, created once. `useRef` in a loop is not allowed and a ref
  // array rebuilt on render would hand `captureRef` a detached object.
  const frameRefs = useRef([]);
  if (frameRefs.current.length !== (lines?.length ?? 0)) {
    frameRefs.current = Array.from({ length: lines?.length ?? 0 }, (_, i) => ({
      current: frameRefs.current[i]?.current ?? null,
    }));
  }

  const theme = getTheme(slug);
  // Leaves room for the sheet's own chrome on a small phone.
  const cardWidth = Math.min(width - spacing.xl * 2, 320);

  const onShare = async () => {
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});

    try {
      if (asVideo && canVideo) {
        const result = await exportStory({ refs: frameRefs.current });

        // A failed encode still leaves them a card to send, which is a better
        // outcome than an error toast and an empty-handed exit.
        if (result.uri) {
          await shareVideo(result.uri, {
            text: `${lines[0]?.text}\n\n— Saydle`,
            dialogTitle: t("share.videoTitle"),
          });
          return;
        }
      }

      await shareCard(cardRef, {
        text: `${affirmation?.text}\n\n— Saydle`,
        dialogTitle: t("share.title"),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!affirmation) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[styles.sheet, { backgroundColor: appTheme.gradient[0] }]}
        testID="share-sheet"
      >
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: appTheme.ink }]}>{t("share.title")}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("share.close")}
              hitSlop={10}
              testID="share-close"
            >
              <Ionicons name="close" size={24} color={appTheme.sub} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <ShareCard
              ref={cardRef}
              text={affirmation.text}
              date={date}
              theme={theme}
              ratio={asVideo ? RATIOS.story : ratio}
              width={cardWidth}
            />

            {asVideo ? (
              <Text style={[styles.note, { color: appTheme.sub }]}>
                {t("share.videoNote", { count: lines.length })}
              </Text>
            ) : null}

            <View style={styles.controls}>
              {canVideo ? (
                <>
                  <Text style={[styles.label, { color: appTheme.sub }]}>
                    {t("share.format")}
                  </Text>
                  <View style={styles.row}>
                    {[false, true].map((video) => (
                      <Pressable
                        key={String(video)}
                        onPress={() => setAsVideo(video)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: asVideo === video }}
                        accessibilityLabel={t(video ? "share.asVideo" : "share.asImage")}
                        testID={video ? "share-format-video" : "share-format-image"}
                        style={[
                          styles.pill,
                          { borderColor: appTheme.border },
                          asVideo === video && {
                            backgroundColor: appTheme.accent,
                            borderColor: appTheme.accent,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            { color: appTheme.sub },
                            asVideo === video && styles.pillTextActive,
                          ]}
                        >
                          {t(video ? "share.asVideo" : "share.asImage")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {/* A video is always 9:16, so the shape control has nothing to
                  offer while one is selected. */}
              {asVideo ? null : (
                <>
                  <Text style={[styles.label, { color: appTheme.sub }]}>
                    {t("share.shape")}
                  </Text>
                  <View style={styles.row}>
                    {Object.values(RATIOS).map((option) => (
                      <Pressable
                        key={option.key}
                        onPress={() => setRatio(option)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: ratio.key === option.key }}
                        accessibilityLabel={t(`share.${option.key}`)}
                        style={[
                          styles.pill,
                          { borderColor: appTheme.border },
                          ratio.key === option.key && {
                            backgroundColor: appTheme.accent,
                            borderColor: appTheme.accent,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            { color: appTheme.sub },
                            ratio.key === option.key && styles.pillTextActive,
                          ]}
                        >
                          {t(`share.${option.key}`)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Text style={[styles.label, { color: appTheme.sub }]}>{t("share.look")}</Text>
              <View style={styles.row}>
                {THEMES.map((option) => (
                  <Pressable
                    key={option.slug}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSlug(option.slug);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: slug === option.slug }}
                    accessibilityLabel={option.name}
                    testID={`share-theme-${option.slug}`}
                    style={[
                      styles.swatch,
                      { backgroundColor: option.gradient[1] },
                      slug === option.slug && { borderColor: appTheme.accent, borderWidth: 3 },
                    ]}
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {busy ? (
              <ActivityIndicator color={appTheme.accent} testID="share-busy" />
            ) : (
              <Button title={t(asVideo ? "share.sendVideo" : "share.send")} onPress={onShare} />
            )}
          </View>

          {/* Mounted only while a video is actually being composed: seven live
              cards are seven live gradients, and there is no reason to carry
              them for someone sending a still. */}
          {asVideo && canVideo ? (
            <StoryFrames
              lines={lines}
              refs={frameRefs.current}
              theme={theme}
              width={cardWidth}
            />
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default ShareSheet;

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: {
    ...type.sectionTitle,
    fontSize: 20,
  },
  scroll: {
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.xl,
  },
  controls: {
    alignSelf: "stretch",
    gap: spacing.sm,
  },
  label: {
    ...type.label,
    marginTop: spacing.sm,
  },
  note: {
    ...type.body,
    fontSize: 13,
    textAlign: "center",
    marginTop: -spacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  pillText: { fontSize: 14, fontWeight: "600" },
  pillTextActive: { color: colors.white },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.08)",
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
});
