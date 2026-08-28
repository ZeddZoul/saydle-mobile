/**
 * The form of a line that gets read aloud.
 *
 * An affirmation is written for the reader to say to themselves — "I am allowed
 * to take up space." When someone else's voice reads that, it stops making
 * sense: the voice is claiming *it* is allowed to take up space. Spoken by
 * another person it has to be the second person, "You are allowed to take up
 * space", which is the difference between overhearing an affirmation and
 * receiving one.
 *
 * Today is untouched. There the reader reads it themselves, so the first person
 * is exactly right. Only Practice flips.
 *
 * Names come out, for three reasons and the third is the one that decides it: a
 * synthetic voice mispronounces most names that are not Anglo, it is the one
 * word a reader would catch instantly, and nothing anywhere would report it.
 * And a line carrying a name is unique to one person, so it could never be
 * shared between readers — every clip billed per head, against a cache whose
 * whole premise is that lines repeat.
 *
 * Rules rather than a model call: this runs on every line of every session, so
 * it has to be free, and affirmations are formulaic enough that rules reach
 * them. Generation should eventually emit this form directly, at which point
 * this becomes the fallback for the curated bank and for every line written
 * before that.
 */

/** The only verbs that actually change between "I" and "you". */
const VERBS = [
  [/\bI am\b/g, "you are"],
  [/\bI'm\b/g, "you're"],
  [/\bI was\b/g, "you were"],
  [/\bam I\b/g, "are you"],
];

const PRONOUNS = [
  [/\bI'll\b/g, "you'll"],
  [/\bI've\b/g, "you've"],
  [/\bI'd\b/g, "you'd"],
  [/\bI\b/g, "you"],
  [/\bmyself\b/gi, "yourself"],
  [/\bmine\b/gi, "yours"],
  [/\bmy\b/gi, "your"],
  [/\bme\b/gi, "you"],
];

/** Sentence-cases the result — the replacements above all produce lowercase. */
function recapitalise(text) {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

/** Names can contain regex characters. */
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Removes the reader's name wherever the model placed it.
 *
 * Address forms only — "Ada, you can rest", "you can rest, Ada" — never a bare
 * occurrence, so a name that is also an ordinary word cannot gut the sentence
 * it appears in. Hope, Grace, Faith, Precious and Blessing are all common
 * names and all ordinary words, and "Hope is not something you have to
 * justify" must survive belonging to someone called Hope.
 */
export function stripName(text, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return String(text ?? "").trim();

  const n = escape(trimmed);

  const stripped = String(text ?? "")
    .replace(new RegExp(`^\\s*${n}\\s*[,—-]\\s*`, "i"), "")
    .replace(new RegExp(`\\s*[,—-]\\s*${n}\\s*([.!?])`, "i"), "$1")
    .replace(new RegExp(`\\s*[,—-]\\s*${n}\\s*[,—-]\\s*`, "i"), ", ")
    .trim();

  // Removing a leading address promotes the next word to the start of the
  // sentence, so it has to be capitalised here. `spokenFor` recapitalises again
  // afterwards, but this function is exported and usable on its own — one that
  // hands back a sentence starting lowercase is a trap.
  return recapitalise(stripped);
}

/**
 * The line as another person would say it to you.
 *
 * A line already written in the second person passes through untouched, which
 * is what makes this safe to run over the curated bank without auditing it
 * first.
 */
export function spokenFor(text, { name } = {}) {
  let out = stripName(text, name);

  for (const [pattern, replacement] of VERBS) out = out.replace(pattern, replacement);
  for (const [pattern, replacement] of PRONOUNS) out = out.replace(pattern, replacement);

  return recapitalise(out)
    .replace(/\s{2,}/g, " ")
    .trim();
}
