import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import GradientBackground from "../../components/GradientBackground.jsx";
import FloatingHeader, { FLOATING_HEADER_INSET } from "../../components/FloatingHeader.jsx";
import DisplayText from "../../components/DisplayText.jsx";
import Tile from "../../components/Tile.jsx";
import Button from "../../components/Button";
import Spacer from "../../components/Spacer";
import ReminderSetup from "../../components/onboarding/ReminderSetup.jsx";
import LanguagePicker from "../../components/LanguagePicker.jsx";
import CompletenessMeter from "../../components/CompletenessMeter.jsx";
import ProfileNudge from "../../components/ProfileNudge.jsx";
import DeleteAccountSheet from "../../components/DeleteAccountSheet.jsx";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useReminders } from "../../hooks/useReminders.js";
import { useSubscription } from "../../hooks/useSubscription.js";
import { useProfileNudge } from "../../hooks/useProfileNudge.js";
import { useLocale } from "../../hooks/useLocale.js";
import { DELETION_GRACE_DAYS } from "../../lib/config.js";
import { PRIVACY_URL, TERMS_URL, supportMailto } from "../../lib/legal.js";
import { messageFor, NetworkError } from "../../lib/errors.js";
import { t as tNow, useT } from "../../lib/i18n.js";
import { colors, radius, shadow, spacing, type } from "../../theme/tokens.js";

const TONES = [
  { value: "gentle", labelKey: "profile.toneGentle" },
  { value: "grounded", labelKey: "profile.toneGrounded" },
  { value: "energetic", labelKey: "profile.toneEnergetic" },
];

const initialsOf = (user) =>
  `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() || "?";

const Chip = ({ label, active, disabled, onPress, theme }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected: active, disabled }}
    style={[
      styles.chip,
      { borderColor: theme.border, backgroundColor: theme.surfaceStrong },
      active && { backgroundColor: theme.accent, borderColor: theme.accent },
    ]}
  >
    <Text style={[styles.chipText, { color: theme.sub }, active && styles.chipTextActive]}>
      {label}
    </Text>
  </Pressable>
);

const Profile = () => {
  const { t, tf } = useT();
  const router = useRouter();
  const { entitled } = useSubscription();
  const { user, client, signOut, deleteAccount, updatePreferences, offline } = useAuth();
  const toast = useToast();
  const reminders = useReminders();
  const nudge = useProfileNudge();
  const language = useLocale();
  // Theme lives on its own screen now — Profile only reads the colours.
  const { theme } = useAppTheme();

  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Local copy so the slider moves smoothly; committed on release.
  const [draft, setDraft] = useState(reminders.settings);

  const preferences = user?.preferences ?? {};
  const selectedCategories = preferences.categories ?? [];

  useEffect(() => {
    let cancelled = false;
    client
      .categories()
      .then(({ categories: list }) => {
        if (!cancelled) setCategories(list);
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof NetworkError)) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Follow the saved settings when they change from elsewhere (sign-in, sync).
  useEffect(() => {
    setDraft(reminders.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders.settings.count, reminders.settings.start, reminders.settings.end]);

  const save = async (patch) => {
    Haptics.selectionAsync().catch(() => {});
    setSaving(true);
    try {
      await updatePreferences(patch);
      toast.success(t("profile.preferencesSaved"));
    } catch (err) {
      toast.error(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (slug) => {
    const next = selectedCategories.includes(slug)
      ? selectedCategories.filter((s) => s !== slug)
      : [...selectedCategories, slug];
    save({ categories: next });
  };

  const onToggleReminders = async (enabled) => {
    const result = await reminders.setEnabled(enabled);

    if (result.ok) {
      toast.success(t(enabled ? "profile.remindersOn" : "profile.remindersOff"));
    } else if (result.reason === "denied") {
      // The OS won't re-prompt once refused, so point at the only place it can
      // actually be changed.
      toast.error(t("profile.remindersDenied"));
    } else {
      toast.error(t("common.saveFailed"));
    }
  };

  // The slider reports every tick for live feedback, but only the settled value
  // is saved — so a drag is one request rather than twenty.
  const onCommitReminders = async (next) => {
    const result = await reminders.setWindow(next);
    if (!result.ok) toast.error(t("common.saveFailed"));
  };

  const onChangeLanguage = async (next) => {
    if (next === language.locale) return;
    setSaving(true);
    try {
      await language.setLocale(next);
      // `tNow` rather than the subscribed `t`: this closure captured `t` from
      // the render *before* the switch, so using it would confirm a change to
      // Spanish in English. The bare export reads the current language at call
      // time, which is what a confirmation of this particular action needs.
      toast.success(tNow("profile.preferencesSaved"));
    } catch (err) {
      toast.error(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  // A system Alert cannot take two fields, and it cannot say the thing this
  // screen most needs to say — that nothing is destroyed today.
  const confirmDelete = () => setDeleting(true);

  const openLink = (url) =>
    Linking.openURL(url).catch(() => toast.error(t("legal.openFailed")));

  const LEGAL_ROWS = [
    {
      key: "privacy",
      icon: "shield-checkmark-outline",
      label: t("legal.privacy"),
      url: PRIVACY_URL,
    },
    { key: "terms", icon: "document-text-outline", label: t("legal.terms"), url: TERMS_URL },
    {
      key: "support",
      icon: "mail-outline",
      label: t("legal.contact"),
      url: supportMailto(t("legal.supportSubject")),
    },
  ];

  return (
    <GradientBackground>
      <FloatingHeader title={t("tabs.profile")} />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.accent, shadowColor: theme.accent },
            ]}
          >
            <DisplayText weight="bold" style={styles.avatarText}>
              {initialsOf(user)}
            </DisplayText>
          </View>
          <DisplayText weight="bold" style={[styles.name, { color: theme.ink }]}>
            {user?.firstName} {user?.lastName}
          </DisplayText>
          <Text style={[styles.email, { color: theme.sub }]}>{user?.email}</Text>
        </View>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {messageFor(error)}
          </Text>
        ) : null}

        {nudge.completeness ? (
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
              {t("profile.personalization")}
            </DisplayText>
            <CompletenessMeter
              percent={nudge.completeness.percent}
              label={t("profile.personalizationValue", { percent: nudge.completeness.percent })}
            />
            {/* The same meter says two different things depending on whether
                Saydle can act on any of it. For a free reader the number is the
                argument: they have told us a great deal and none of it reaches
                their affirmations yet. Their own data, reflected back — no
                claim, no urgency, nothing manufactured. */}
            {entitled ? (
              <Text style={[styles.hint, { color: theme.sub }]}>
                {t("profile.personalizationUnlocked")}
              </Text>
            ) : (
              <>
                <Text style={[styles.hint, { color: theme.sub }]}>
                  {t("profile.personalizationLocked")}
                </Text>
                <Text style={[styles.gap, { color: theme.ink }]}>
                  {t("profile.personalizationLockedGap")}
                </Text>
                <Button
                  title={t("profile.personalizationCta")}
                  onPress={() => router.push("/billing")}
                  style={styles.personalizationCta}
                />
              </>
            )}
          </View>
        ) : null}

        {/* The next unanswered question, offered here without the Today screen's
            backoff — someone on this screen is already looking to tune things. */}
        {nudge.pending ? (
          <ProfileNudge
            suggestion={nudge.pending}
            onAnswer={nudge.answer}
            style={styles.nudge}
          />
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
            {t("profile.tone")}
          </DisplayText>
          <View style={styles.row}>
            {TONES.map((tone) => (
              <Chip
                key={tone.value}
                label={t(tone.labelKey)}
                theme={theme}
                active={preferences.tone === tone.value}
                disabled={saving}
                onPress={() => save({ tone: tone.value })}
              />
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
            {t("profile.categories")}
          </DisplayText>
          {categories.length === 0 ? (
            <Text style={[styles.hint, { color: theme.sub }]}>
              {t(offline ? "profile.categoriesOffline" : "profile.categoriesLoading")}
            </Text>
          ) : (
            <View style={styles.row}>
              {categories.map((category) => (
                <Chip
                  key={category.slug}
                  label={tf(`categories.${category.slug}`, category.name)}
                  theme={theme}
                  active={selectedCategories.includes(category.slug)}
                  disabled={saving}
                  onPress={() => toggleCategory(category.slug)}
                />
              ))}
            </View>
          )}
          <Text style={[styles.hint, { color: theme.sub }]}>{t("profile.categoriesHint")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
            {t("profile.language")}
          </DisplayText>
          <LanguagePicker
            value={language.locale}
            onChange={onChangeLanguage}
            disabled={saving}
          />
          <Text style={[styles.hint, { color: theme.sub }]}>{t("profile.languageHint")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.reminderHeader}>
            <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
              {t("profile.reminders")}
            </DisplayText>
            <Switch
              value={reminders.settings.enabled}
              onValueChange={onToggleReminders}
              disabled={reminders.saving}
              trackColor={{ true: theme.accent, false: theme.border }}
              thumbColor={colors.white}
              accessibilityLabel={t("profile.reminders")}
            />
          </View>

          {reminders.settings.enabled ? (
            <>
              {/* The same control as onboarding, minus the notification preview. */}
              <ReminderSetup
                compact
                value={draft}
                onChange={setDraft}
                onCommit={onCommitReminders}
                disabled={reminders.saving}
              />
              <Text style={[styles.hint, { color: theme.sub }]}>
                {t("profile.remindersSummary", {
                  count: draft.count,
                  start: draft.start,
                  end: draft.end,
                })}
              </Text>
            </>
          ) : (
            <Text style={[styles.hint, { color: theme.sub }]}>
              {t("profile.remindersIdle")}
            </Text>
          )}
        </View>

        {/* The places you can go, drawn rather than listed. Only destinations
            belong here — the sections above hold controls, and mixing the two
            in one grid is what makes a settings screen unreadable. */}
        <DisplayText style={[styles.sectionTitle, styles.gridTitle, { color: theme.ink }]}>
          {t("profile.yourStuff")}
        </DisplayText>
        <View style={styles.grid}>
          <Tile
            art="myWords"
            label={t("myWords.title")}
            testID="tile-my-words"
            onPress={() => router.push("/my-words")}
          />
          <Tile
            art="favorites"
            label={t("tabs.favorites")}
            testID="tile-favorites"
            onPress={() => router.push("/favorites")}
          />
        </View>
        <View style={styles.grid}>
          <Tile
            art="theme"
            label={t("profile.theme")}
            testID="tile-themes"
            onPress={() => router.push("/themes")}
          />
          <Tile
            art="subscription"
            label={t("billing.title")}
            testID="tile-billing"
            onPress={() => router.push("/billing")}
          />
        </View>

        {/* The documents and the door to a human. App Review looks for both;
            so does anyone deciding whether to trust an app with how they have
            been feeling. */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <DisplayText style={[styles.sectionTitle, { color: theme.ink }]}>
            {t("legal.title")}
          </DisplayText>
          {LEGAL_ROWS.map((row) => (
            <Pressable
              key={row.key}
              onPress={() => openLink(row.url)}
              accessibilityRole="link"
              style={styles.legalRow}
              testID={`legal-${row.key}`}
            >
              <Ionicons name={row.icon} size={18} color={theme.accent} />
              <Text style={[styles.legalText, { color: theme.ink }]}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.sub} />
            </Pressable>
          ))}
        </View>

        <Spacer height={spacing.xl} />

        <Button title={t("profile.signOut")} onPress={signOut} variant="secondary" />

        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          style={styles.deleteButton}
        >
          <Text style={styles.deleteText}>{t("profile.deleteAccount")}</Text>
        </Pressable>
      </ScrollView>

      <DeleteAccountSheet
        visible={deleting}
        email={user?.email}
        graceDays={DELETION_GRACE_DAYS}
        onClose={() => setDeleting(false)}
        onConfirm={deleteAccount}
      />
    </GradientBackground>
  );
};

export default Profile;

const styles = StyleSheet.create({
  gap: { ...type.body, fontSize: 15, fontWeight: "600", marginTop: spacing.sm },
  personalizationCta: { marginTop: spacing.md },
  container: {
    padding: spacing.xl,
    // Clear the tab bar (≈88pt) with breathing room below Delete account.
    paddingBottom: 112,
    // Clears the floating header, which overlays rather than occupies.
    // Declared after any `padding` shorthand: that shorthand resets
    // paddingTop, so ordering here is load-bearing.
    paddingTop: FLOATING_HEADER_INSET,
  },
  identity: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...shadow.button,
  },
  avatarText: {
    color: colors.white,
    fontSize: 26,
  },
  name: {
    fontSize: 24,
    color: colors.ink,
  },
  email: {
    fontSize: 14,
    color: colors.inkSoft,
    marginTop: 2,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  sectionTitle: {
    ...type.sectionTitle,
    marginBottom: spacing.md,
  },
  // The card sets its own Today-screen spacing; in this stack it's just a card.
  nudge: {
    marginTop: 0,
    marginBottom: spacing.md,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  linkText: {
    flex: 1,
  },
  gridTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  legalText: { flex: 1, fontSize: 15 },
  grid: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  linkTitle: {
    marginBottom: 2,
  },
  linkHint: {
    marginTop: 0,
  },
  reminderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.mauve,
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  chipText: {
    color: colors.mauveDeep,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.white,
  },
  hint: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: spacing.md,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  deleteButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 15,
  },
});
