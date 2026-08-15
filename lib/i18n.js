import { useCallback } from "react";
import * as i18nextModule from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { getLocales } from "expo-localization";
import en from "../locales/en.json";
import es from "../locales/es.json";

// Namespace import above, unwrapped here: i18next re-exports `t`, `use`, and
// `changeLanguage` as named exports too, so a default import reads ambiguously.
const i18next = i18nextModule.default ?? i18nextModule;

/**
 * Translations, on i18next + react-i18next.
 *
 * react-i18next rather than a bare lookup library because changing language has
 * to repaint the app: components read strings through `useTranslation()`, which
 * subscribes them, so `changeLanguage` re-renders everything holding a string.
 * Without that the only options are a hand-rolled subscriber list or remounting
 * the navigator — both worse than using the library built for it.
 *
 * Adding a language is NOT just a locale file. Affirmations are generated and
 * then checked by a deterministic safety layer, and that layer is per-language —
 * see server/src/config/locales.js. A language ships only once it has:
 *
 *   1. this locale file,
 *   2. translated moderation rules (banned topics, first-person opening),
 *   3. a translated curated fallback bank.
 *
 * Without (2) the safety floor is blind; without (3) an outage falls back to
 * English. `SUPPORTED_LOCALES` is the gate — keep it in sync with the server.
 */
export const SUPPORTED_LOCALES = ["en", "es"];
export const DEFAULT_LOCALE = "en";

/** Endonyms: a language picker should read in the language it offers. */
export const LOCALE_NAMES = {
  en: "English",
  es: "Español",
};

/** The device's preferred language, if we can actually support it. */
export function detectLocale() {
  try {
    for (const { languageCode } of getLocales()) {
      if (SUPPORTED_LOCALES.includes(languageCode)) return languageCode;
    }
  } catch {
    /* locale detection is best-effort */
  }
  return DEFAULT_LOCALE;
}

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: detectLocale(),
  fallbackLng: DEFAULT_LOCALE,
  // Synchronous init, so the first render already has strings and tests don't
  // await a load that never touches the network.
  initImmediate: false,
  // React Native has no HTML to escape, and escaping mangles apostrophes.
  interpolation: { escapeValue: false },
  returnNull: false,
  // `landing.testimonials` is a list; i18next returns the key rather than the
  // array unless this is on.
  returnObjects: true,
});

export { i18next, useTranslation };

/**
 * The hook components should use. It is react-i18next's own `useTranslation`
 * with `tf` bound to the same subscribed `t`, so config fallbacks re-render on a
 * language change exactly like ordinary keys do.
 */
export function useT() {
  const { t: translate } = useTranslation();
  const tf = useCallback(
    (key, fallback) => translate(key, { defaultValue: fallback }),
    [translate],
  );
  return { t: translate, tf };
}

export function setLocale(locale) {
  const next = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  i18next.changeLanguage(next);
  return next;
}

/**
 * Translate outside a component — errors, plain modules, anything with no render
 * to subscribe. Inside a component prefer `useTranslation()`, which re-renders
 * on a language change; this one is read once and does not.
 */
export const t = (key, options) => i18next.t(key, options);

/**
 * Translate a content-config string, falling back to the literal already in the
 * config. Used for the onboarding questions, whose English text lives in
 * lib/onboardingQuestions.js — so en.json doesn't have to duplicate ~200 strings
 * and a new language only adds the `questions.*` keys it wants to override.
 */
export const tf = (key, fallback) => i18next.t(key, { defaultValue: fallback });
