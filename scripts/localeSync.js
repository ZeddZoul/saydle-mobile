/**
 * The pure half of `pnpm translate` — everything that can go wrong silently.
 *
 * Machine translation mangles two things in our strings, and both fail quietly:
 * interpolation placeholders (`{{name}}` comes back as `{{nombre}}` or vanishes)
 * and keys that a human has already reviewed (re-translating undoes the review).
 * These functions are what stop that, so they are unit-tested rather than left
 * inside a script nobody runs twice.
 */

/** Every leaf path in a nested locale object, e.g. "profile.tone". */
export function leafPaths(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? leafPaths(value, path)
      : [path];
  });
}

export function getPath(object, path) {
  return path.split(".").reduce((node, key) => node?.[key], object);
}

export function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((node, key) => (node[key] ??= {}), object);
  parent[last] = value;
  return object;
}

/**
 * Keys present in `source` but missing from `target`.
 *
 * Only these are ever sent for translation: a key that already has a value has
 * been through a human, and overwriting it would quietly undo that review.
 */
export function missingPaths(source, target) {
  return leafPaths(source).filter((path) => getPath(target, path) === undefined);
}

const PLACEHOLDER = /\{\{\s*\w+\s*\}\}/g;

/**
 * Hides `{{name}}` behind an XML tag the translator is told to leave alone.
 *
 * Sent raw, "Hello, {{name}}" comes back as "Hola, {{nombre}}" — a placeholder
 * i18next will never fill, so the reader sees the literal braces.
 */
export function protectPlaceholders(text) {
  const found = [];

  const protectedText = String(text).replace(PLACEHOLDER, (match) => {
    found.push(match);
    return `<ph id="${found.length - 1}"/>`;
  });

  return { text: protectedText, placeholders: found };
}

export function restorePlaceholders(text, placeholders) {
  return String(text).replace(
    /<ph id="(\d+)"\s*\/>/g,
    (whole, index) => placeholders[Number(index)] ?? whole,
  );
}

/**
 * True when a translation came back with the same placeholders it went out
 * with. A mismatch means the string is unusable — better to skip the key and
 * fall back to English than to ship a sentence with a hole in it.
 */
export function placeholdersIntact(source, translated) {
  const of = (s) => (String(s).match(PLACEHOLDER) ?? []).sort().join("|");
  return of(source) === of(translated);
}

/**
 * Content this script must never touch, with the reason.
 *
 * Machine translation is fine for UI chrome. It is not fine for the affirmation
 * bank — a literally translated affirmation stops sounding like something a
 * person would say — and it is meaningless for the moderation rules, which are
 * regexes, not prose. Both are written by hand, per language, on purpose.
 */
export const NEVER_TRANSLATE = {
  "server/src/data/curated.js": "affirmations are written in-language, not translated",
  "server/src/services/moderation.service.js": "safety rules are regexes, not prose",
};
