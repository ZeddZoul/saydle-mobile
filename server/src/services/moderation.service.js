import { DEFAULT_LOCALE } from "../config/locales.js";

/**
 * Deterministic checks applied to every affirmation before it is stored, and to
 * user-supplied focus text before it is sent to the model.
 *
 * This is a floor, not a ceiling: Vertex safety settings run upstream and the
 * system prompt states the rules. This layer exists because a prompt is a
 * request, not a guarantee, and anything that reaches a user's morning screen
 * should have passed something that cannot be talked out of it.
 *
 * The rules are PER-LANGUAGE — they are literal words and sentence openings, so
 * English patterns say nothing about Spanish text. A language with no rules
 * fails closed (nothing is approved) rather than silently passing unchecked
 * content; see config/locales.js for what shipping a language requires.
 */

const MAX_LENGTH = 100;
const MIN_WORDS = 3;
const MAX_WORDS = 20;

/**
 * JavaScript's `\b` only knows ASCII, so `/\btú\b/` never matches "tú" and
 * `/\bagresión\b/` never matches the accented form — the boundary check fails
 * on the very characters Spanish needs. These build the boundary explicitly.
 */
const ES_LETTERS = "a-zñáéíóúü";

/** Whole words: bounded on both sides. */
const es = (body) => new RegExp(`(?<![${ES_LETTERS}])(?:${body})(?![${ES_LETTERS}])`, "i");

/**
 * Stems: bounded only at the start, so "suicid" also catches "suicidándome".
 * `\w*` would not — it stops at the first accented letter and the trailing
 * boundary then fails, quietly letting the word through.
 */
const esStem = (body) => new RegExp(`(?<![${ES_LETTERS}])(?:${body})`, "i");

const RULES = {
  en: {
    // Topics an affirmation must never touch, however it was prompted.
    forbidden: [
      /\bsuicid|\bkill (myself|yourself)|\bself[- ]harm|\bcutting\b/i,
      // Violence toward others. The screen originally covered only
      // self-directed harm, and "I can kill as much as I want" walked straight
      // through it onto a home-screen widget. Idioms ("dressed to kill",
      // "killing it at work") will occasionally trip this; the cost of a false
      // positive here is a line staying private or a focus going unechoed,
      // which is the right side to err on.
      /\bkill(ing)?\b|\bmurder|\bshoot(ing)?\b|\bstab|\bweapon|\bgun\b|\bviolen|\bhurt (someone|somebody|him|her|them|people|others)\b/i,
      /\banorexi|\bbulimi|\bpurg(e|ing)\b|\bcalorie|\bdiet\b|\bweight\b|\bthin(ner)?\b/i,
      // The prompt forbids referencing the reader's body or appearance at all.
      /\bskinny\b|\bfat\b|\battractive\b|\bmy body\b|\bmy looks\b/i,
      /\bdepress(ed|ion)|\banxiety disorder|\bbipolar|\bptsd\b|\bdiagnos/i,
      /\bmedication|\btherapist|\bprescri|\bcure[ds]?\b|\bheal(s|ed)? my\b/i,
      /\babuse|\bassault|\btrauma\b/i,
      /\bdrunk|\bsober\b|\brelapse|\baddict/i,
    ],
    // Second person, imperatives, and the wellness lexicon the prompt bans.
    style: [
      { pattern: /\byou(r|'re| are)?\b/i, reason: "second person" },
      { pattern: /[?!]/, reason: "question or exclamation" },
      { pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, reason: "emoji" },
      { pattern: /#\w/, reason: "hashtag" },
      {
        pattern:
          /\b(manifest|abundance|vibration|the universe|blessed|warrior|unstoppable|limitless|crush it|level up)\b/i,
        reason: "banned vocabulary",
      },
    ],
    firstPerson: /^(i|my|today i|today,? i)\b/i,
  },

  es: {
    forbidden: [
      esStem(String.raw`suicid|matarme|quitarme la vida|autolesi|cortarme`),
      // Violence toward others — mirrors the English rule above.
      esStem(
        String.raw`matar|asesinat|asesin|apu[ñn]al|disparar|violenci|arma\b|lastimar a|hacer da[ñn]o a`,
      ),
      esStem(String.raw`anorexi|bulimi|purga|calor[íi]a|dieta|delgad|adelgaz`),
      es(String.raw`peso`),
      // Mirrors the English rule: the body and appearance are off limits entirely.
      esStem(String.raw`flac[oa]|gord[oa]|atractiv`),
      es(String.raw`mi cuerpo|mi aspecto|mi figura`),
      esStem(String.raw`depresi|depresiv|trastorno|bipolar|tept|diagn[óo]stic`),
      esStem(String.raw`medicaci|medicament|terapeut|terapia|receta|cura`),
      esStem(String.raw`abuso|agresi[óo]n|trauma|maltrato`),
      esStem(String.raw`borrach|sobri[oa]|reca[íi]da|adicci|adict`),
    ],
    style: [
      // Spanish marks the second person in pronouns and clitics; none of them
      // belong in a sentence the reader says to themselves.
      { pattern: es(String.raw`t[úu]|tus?|usted(es)?|ti|contigo|te`), reason: "second person" },
      { pattern: /[?!¿¡]/, reason: "question or exclamation" },
      { pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, reason: "emoji" },
      { pattern: /#\w/, reason: "hashtag" },
      {
        pattern: esStem(
          String.raw`manifest|abundancia|vibraci[óo]n|el universo|bendecid|guerrer[oa]|imparable|sin l[íi]mites|arrasar|subir de nivel`,
        ),
        reason: "banned vocabulary",
      },
    ],
    /**
     * Spanish is pro-drop: "Puedo descansar" is first person with no pronoun in
     * sight, so the English "starts with I" test has no direct equivalent. This
     * is a whitelist of the first-person openings our voice actually uses —
     * pronouns, possessives, and the permission-first verbs.
     *
     * It is deliberately strict. A false reject costs one generated line and
     * falls back to the curated bank; a false accept puts unvetted text on
     * someone's morning screen.
     */
    firstPerson: new RegExp(
      `^(?:hoy,?\\s+)?(?:${[
        "yo",
        "me",
        "mis?",
        "m[íi]",
        "no\\s+(?:tengo|necesito|debo|estoy|soy)",
        "puedo",
        "permito",
        "merezco",
        "elijo",
        "tengo",
        "estoy",
        "soy",
        "s[ée]",
        "quiero",
        "dejo",
        "hago",
        "voy",
        "acepto",
        "conf[íi]o",
        "respiro",
        "descanso",
        "avanzo",
        "empiezo",
        "logro",
        "cuido",
        "vivo",
        "siento",
        "aprendo",
        "agradezco",
        "valgo",
        "not[oa]",
        "elijo",
      ].join("|")})(?![${ES_LETTERS}])`,
      "i",
    ),
  },
};

/**
 * @param {string} text
 * @param {string} [locale]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkAffirmation(text, locale = DEFAULT_LOCALE) {
  const rules = RULES[locale];
  // Fail closed: with no rules for this language we cannot vouch for the text.
  if (!rules) return { ok: false, reason: "unsupported language" };

  if (typeof text !== "string") return { ok: false, reason: "not a string" };

  const trimmed = text.trim();

  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_LENGTH) return { ok: false, reason: "too long" };

  const words = trimmed.split(/\s+/);
  if (words.length < MIN_WORDS) return { ok: false, reason: "too few words" };
  if (words.length > MAX_WORDS) return { ok: false, reason: "too many words" };

  for (const pattern of rules.forbidden) {
    if (pattern.test(trimmed)) return { ok: false, reason: "forbidden topic" };
  }

  // Checked before the first-person test so that "You are enough" reports the
  // specific problem (second person) rather than the symptom (wrong opening).
  for (const { pattern, reason } of rules.style) {
    if (pattern.test(trimmed)) return { ok: false, reason };
  }

  if (!rules.firstPerson.test(trimmed)) {
    return { ok: false, reason: "does not open in first person" };
  }

  return { ok: true };
}

export function filterAffirmations(items, locale = DEFAULT_LOCALE) {
  const approved = [];
  const rejected = [];
  const seen = new Set();

  for (const item of items) {
    const result = checkAffirmation(item.text, locale);
    const key = item.text?.trim().toLowerCase();

    if (!result.ok) {
      rejected.push({ ...item, reason: result.reason });
      continue;
    }
    if (seen.has(key)) {
      rejected.push({ ...item, reason: "duplicate within batch" });
      continue;
    }

    seen.add(key);
    approved.push({ ...item, text: item.text.trim() });
  }

  return { approved, rejected };
}

/**
 * True when a user's stated focus suggests crisis or clinical content.
 *
 * We do not refuse these users — we route them to the curated bank of gentle,
 * general affirmations instead of generating against their text, and never echo
 * the topic back at them.
 *
 * Unknown languages are treated as needing care: if we can't read it, we don't
 * send it to the model.
 */
export function focusNeedsCare(text, locale = DEFAULT_LOCALE) {
  if (typeof text !== "string" || text.trim() === "") return false;

  const rules = RULES[locale];
  if (!rules) return true;

  return rules.forbidden.some((pattern) => pattern.test(text));
}
