import fs from "node:fs";
import path from "node:path";
import en from "../../locales/en.json";
import es from "../../locales/es.json";

/**
 * Two contracts nothing else was checking, both of which had already been broken.
 *
 * A key that does not exist does not throw: i18next returns the key itself, so
 * the app renders "today.favorite" to a screen reader and nothing anywhere
 * says so. That one shipped. A colour hardcoded on a themed surface does not
 * throw either; it just becomes illegible on the dark themes, which is how the
 * delete link ended up at 1.8:1 on Dusk.
 *
 * Both are scans rather than assertions about particular files, because the
 * failure mode is a NEW piece of code forgetting, not an old one regressing.
 */

const ROOT = path.join(__dirname, "..", "..");
const DIRS = ["app", "components", "hooks", "lib", "contexts"];

const sources = () => {
  const found = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.jsx?$/.test(entry.name)) found.push(full);
    }
  };

  for (const dir of DIRS) walk(path.join(ROOT, dir));
  return found;
};

const relative = (file) => path.relative(ROOT, file);

describe("every key the app asks for exists", () => {
  // `t("a.b")` and `tf("a.b", "fallback")`. Template literals and computed keys
  // are skipped deliberately: they cannot be resolved statically, and a scan
  // that guessed at them would produce failures nobody can act on.
  const CALL = /\btf?\(\s*"([a-zA-Z][\w.]*)"/g;

  const lookup = (bundle, key) =>
    key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), bundle);

  const used = () => {
    const keys = new Map();

    for (const file of sources()) {
      const text = fs.readFileSync(file, "utf8");
      for (const [, key] of text.matchAll(CALL)) {
        if (!key.includes(".")) continue; // not a translation key
        if (!keys.has(key)) keys.set(key, relative(file));
      }
    }

    return keys;
  };

  it("finds keys to check, so a broken scan cannot pass as a clean one", () => {
    expect(used().size).toBeGreaterThan(50);
  });

  it("resolves every one of them in English", () => {
    // The bug this would have caught: AffirmationFeed asked for
    // `today.favorite`, which has never existed, and the heart announced the
    // key name to a screen reader.
    const missing = [...used()]
      .filter(([key]) => typeof lookup(en, key) !== "string")
      .map(([key, file]) => `${key} (${file})`);

    expect(missing).toEqual([]);
  });

  it("resolves every one of them in Spanish", () => {
    const missing = [...used()]
      .filter(([key]) => typeof lookup(es, key) !== "string")
      .map(([key, file]) => `${key} (${file})`);

    expect(missing).toEqual([]);
  });
});

describe("the two locales stay the same shape", () => {
  const flatten = (node, prefix = "") =>
    Object.entries(node).flatMap(([key, value]) =>
      value && typeof value === "object"
        ? flatten(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );

  it("translates every English string", () => {
    const spanish = new Set(flatten(es));

    expect(flatten(en).filter((key) => !spanish.has(key))).toEqual([]);
  });

  it("carries extra Spanish keys only where English is allowed to be absent", () => {
    // The onboarding questions are the documented asymmetry: their English
    // lives in lib/onboardingQuestions.js and `tf(key, fallback)` reads it from
    // there, so `questions.*` exists in Spanish and deliberately not in
    // English. Anywhere else, a Spanish-only key is a leftover from a string
    // that was renamed or deleted on one side.
    const english = new Set(flatten(en));

    const orphans = flatten(es).filter(
      (key) => !english.has(key) && !key.startsWith("questions."),
    );

    expect(orphans).toEqual([]);
  });

  it("keeps the same placeholders in both, so a translation cannot drop one", () => {
    // `pnpm translate` drops a string whose {{placeholders}} came back changed,
    // but a hand edit has nothing stopping it, and the symptom is a name or a
    // price simply missing from a sentence.
    const holders = (s) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).sort();

    const walk = (left, right, prefix = "") => {
      for (const [key, value] of Object.entries(left)) {
        const mirror = right?.[key];
        if (value && typeof value === "object") walk(value, mirror, `${prefix}${key}.`);
        else if (typeof value === "string" && typeof mirror === "string") {
          expect({ key: `${prefix}${key}`, holders: holders(mirror) }).toEqual({
            key: `${prefix}${key}`,
            holders: holders(value),
          });
        }
      }
    };

    walk(en, es);
  });
});

describe("destructive colour comes from the theme", () => {
  /**
   * `colors.danger` is the brand red, chosen against white. It is correct on
   * the toast and on the field's own error border, which really are white, and
   * illegible everywhere else: 1.8:1 against Dusk's backdrop, where the one
   * word it paints is "Delete account".
   */
  const ALLOWED = new Set([
    // Renders on colors.white.
    "contexts/ToastContext.jsx",
    // The error border sits on the white field box, not on the page.
    "components/FormField.jsx",
    // The definition itself.
    "theme/tokens.js",
  ]);

  it("is not hardcoded on any surface the theme paints", () => {
    const offenders = sources()
      .filter((file) => !ALLOWED.has(relative(file)))
      .filter((file) => fs.readFileSync(file, "utf8").includes("colors.danger"))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it("is not written as a literal hex anywhere", () => {
    // The first version of the locked screen carried its own #B3261E, which is
    // how two reds end up on one screen.
    const REDS = /#(?:B3261E|C0392B|D32F2F|FF3B30|E53935)/i;

    const offenders = sources()
      .filter((file) => REDS.test(fs.readFileSync(file, "utf8")))
      .map(relative);

    expect(offenders).toEqual([]);
  });
});
