import { useCallback, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { i18next, setLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "../lib/i18n.js";

/**
 * Keeps the app's language in step with the account's.
 *
 * The account is the source of truth, not the device: the server decides which
 * language it can generate and moderate in, and it is what the reader last
 * chose. On sign-in — including on another phone — the app follows it.
 *
 * `changeLanguage` re-renders everything reading a string through
 * `useT`/`useTranslation`, so no remount is needed.
 */
export function useLocale() {
  const { user, updatePreferences } = useAuth();
  const accountLocale = user?.locale;

  useEffect(() => {
    if (accountLocale && accountLocale !== i18next.language) setLocale(accountLocale);
  }, [accountLocale]);

  const change = useCallback(
    async (next) => {
      if (!SUPPORTED_LOCALES.includes(next)) return;

      // Applied locally first so the picker responds immediately; the request
      // then persists it and rebuilds the days ahead in the new language.
      setLocale(next);
      await updatePreferences({ locale: next });
    },
    [updatePreferences],
  );

  return {
    locale: accountLocale ?? i18next.language ?? DEFAULT_LOCALE,
    locales: SUPPORTED_LOCALES,
    setLocale: change,
  };
}
