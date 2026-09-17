import {
  DEFAULT_LOCALE,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  i18next,
  setLocale,
  t,
  tf,
} from "../../lib/i18n.js";
import en from "../../locales/en.json";
import es from "../../locales/es.json";
import { ONBOARDING_QUESTIONS } from "../../lib/onboardingQuestions.js";
import { SUPPORTED_LOCALES as SERVER_LOCALES } from "../../server/src/config/locales.js";

afterEach(() => setLocale(DEFAULT_LOCALE));

// Every leaf key, so a half-translated file is a test failure rather than an
// English string surfacing in a Spanish app.
function leafKeys(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? leafKeys(value, path)
      : [path];
  });
}

describe("the language gate", () => {
  it("advertises exactly what the server can moderate", () => {
    // The client offering a language the server can't check would mean
    // generating affirmations that pass no safety layer at all.
    expect([...SUPPORTED_LOCALES].sort()).toEqual([...SERVER_LOCALES].sort());
  });

  it("names every language it offers, in that language", () => {
    const unnamed = SUPPORTED_LOCALES.filter((locale) => !LOCALE_NAMES[locale]);

    expect(unnamed).toEqual([]);
    expect(LOCALE_NAMES.es).toBe("Español");
  });

  it("ignores a language it cannot support", () => {
    // The device may well be set to one; we fall back rather than half-ship it.
    expect(setLocale("fr")).toBe("en");
    expect(setLocale(undefined)).toBe("en");
  });
});

describe("locale files", () => {
  it("translates every key English has", () => {
    const missing = leafKeys(en).filter((key) => !leafKeys(es).includes(key));
    expect(missing).toEqual([]);
  });

  it("keeps the interpolation placeholders each string needs", () => {
    const placeholders = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    const mismatched = [];

    const walk = (a, b, path = "") => {
      for (const [key, value] of Object.entries(a)) {
        const here = path ? `${path}.${key}` : key;
        if (typeof value === "string") {
          const want = placeholders(value);
          const got = placeholders(b?.[key] ?? "");
          if (want.join() !== got.join()) mismatched.push({ key: here, want, got });
        } else if (value && !Array.isArray(value)) {
          walk(value, b?.[key] ?? {}, here);
        }
      }
    };

    walk(en, es);

    // A dropped {{name}} shows the reader a sentence with a hole in it.
    expect(mismatched).toEqual([]);
  });
});

describe("translation", () => {
  it("switches language for every string at once", () => {
    expect(t("profile.tone")).toBe("Tone");

    setLocale("es");

    expect(i18next.language).toBe("es");
    expect(t("profile.tone")).toBe("Tono");
    expect(t("today.greeting", { name: "Ada" })).toBe("Hola, Ada");
  });

  it("interpolates without escaping the apostrophes in our copy", () => {
    // i18next escapes for HTML by default, which would render "Don&#39;t".
    expect(t("favorites.remove", { text: "I don't have to earn it" })).toContain("don't");
  });

  it("falls back to English for a key a translation hasn't caught up with", () => {
    setLocale("es");
    // A key no locale has, standing in for a question added before its
    // translation — the config's English is what the reader sees meanwhile.
    expect(tf("questions.notYetAsked.title", "What's your sign?")).toBe("What's your sign?");
  });

  it("prefers a translation over the config fallback when it has one", () => {
    setLocale("es");
    expect(tf("questions.ageBand.title", "How old are you?")).toBe("¿Cuántos años tienes?");
  });
});

/**
 * The onboarding copy lives in lib/onboardingQuestions.js in English and is
 * overridden per question under `questions.*`. Spanish is a shipped language,
 * so every step has to be there — a half-translated funnel switches language
 * mid-conversation, which reads as a bug rather than a gap.
 */
describe("Spanish onboarding", () => {
  it("translates every question, including each option", () => {
    const gaps = [];

    for (const q of ONBOARDING_QUESTIONS) {
      const es_q = es.questions[q.key];
      if (!es_q?.title) gaps.push(`${q.key}.title`);
      if (q.subtitle && !es_q?.subtitle) gaps.push(`${q.key}.subtitle`);
      if (q.placeholder && !es_q?.placeholder) gaps.push(`${q.key}.placeholder`);
      if (q.cta && !es_q?.cta) gaps.push(`${q.key}.cta`);
      for (const opt of q.options ?? []) {
        if (!es_q?.options?.[String(opt.value)]) gaps.push(`${q.key}.options.${opt.value}`);
      }
    }

    expect(gaps).toEqual([]);
  });

  it("does not carry a translation for a question that no longer exists", () => {
    const keys = new Set(ONBOARDING_QUESTIONS.map((q) => q.key));
    const orphans = Object.keys(es.questions).filter((key) => !keys.has(key));
    expect(orphans).toEqual([]);
  });
});
