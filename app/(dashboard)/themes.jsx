import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import GradientBackground from "../../components/GradientBackground.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import ThemePicker from "../../components/ThemePicker.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useT } from "../../lib/i18n.js";
import { radius, spacing, type } from "../../theme/tokens.js";

/**
 * Choosing the backdrop, on its own.
 *
 * This lived inside Profile, below tone, categories and language, which meant
 * the floating chrome's theme button had to drop you at the top of a long
 * settings page and leave you to scroll for it. Themes have their own control
 * now, so they get their own screen: one decision, visible immediately, with
 * the change applied live behind the picker rather than described in words.
 */
const Themes = () => {
  const { t } = useT();
  const { theme, setTheme } = useAppTheme();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const onChange = async (slug) => {
    setSaving(true);
    try {
      await setTheme(slug);
    } catch {
      toast.error(t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GradientBackground>
      <FloatingHeader title={t("profile.theme")} />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <ThemePicker value={theme.slug} onChange={onChange} disabled={saving} />
          <Text style={[styles.hint, { color: theme.sub }]}>{t("profile.themeHint")}</Text>
        </View>

        {/* The picker changes the backdrop instantly, so a sample of the thing
            it actually affects is more use than another swatch. */}
        <View style={styles.preview}>
          <DisplayText weight="regular" style={[styles.previewText, { color: theme.ink }]}>
            {t("themes.preview")}
          </DisplayText>
        </View>
      </ScrollView>
    </GradientBackground>
  );
};

export default Themes;

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingBottom: 112,
    // Clears the floating header, which overlays rather than occupies.
    // Declared after the `padding` shorthand, which would reset it.
    paddingTop: FLOATING_HEADER_INSET,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  hint: {
    ...type.body,
    fontSize: 13,
    marginTop: spacing.md,
  },
  preview: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  previewText: {
    fontSize: 22,
    lineHeight: 32,
    textAlign: "center",
  },
});
