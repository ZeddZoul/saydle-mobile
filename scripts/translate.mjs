#!/usr/bin/env node
/**
 * Fills the missing keys of a locale file from English, using DeepL.
 *
 *   DEEPL_API_KEY=… pnpm translate es
 *
 * This is a FIRST PASS, not a shipping translation. It exists so that adding a
 * language is minutes of typing rather than hours, and so the tedious 90% is
 * done by a machine that is good at it. Read what it writes.
 *
 * It deliberately does three things and no more:
 *   - only fills keys that are missing, never overwrites reviewed text,
 *   - protects `{{placeholders}}` and skips any string that comes back mangled,
 *   - refuses to go near the affirmation bank or the moderation rules.
 *
 * A locale file is only one of the three things a language needs before it can
 * ship — see lib/i18n.js and server/src/config/locales.js. This script does not
 * make a language shippable; it makes the boring part cheap.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as deepl from "deepl-node";
import {
  getPath,
  missingPaths,
  placeholdersIntact,
  protectPlaceholders,
  restorePlaceholders,
  setPath,
  NEVER_TRANSLATE,
} from "./localeSync.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localePath = (code) => path.join(root, "locales", `${code}.json`);

// DeepL's own codes differ from ours for a few languages; map as we add them.
const DEEPL_TARGET = { es: "es", fr: "fr", de: "de", pt: "pt-BR", it: "it" };

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

async function main() {
  const target = process.argv[2];

  if (!target) {
    console.error("Usage: DEEPL_API_KEY=… pnpm translate <locale>   e.g. es");
    process.exit(1);
  }

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    console.error(
      "DEEPL_API_KEY is not set. Get a free key at https://www.deepl.com/pro-api",
    );
    process.exit(1);
  }

  if (!DEEPL_TARGET[target]) {
    console.error(
      `No DeepL code mapped for "${target}". Add it to DEEPL_TARGET in this script.`,
    );
    process.exit(1);
  }

  const en = await readJson(localePath("en"));
  const existing = await readJson(localePath(target)).catch(() => ({}));

  const todo = missingPaths(en, existing);

  if (todo.length === 0) {
    console.log(`${target}.json is already complete — nothing to translate.`);
    return;
  }

  console.log(`Translating ${todo.length} missing key(s) into ${target}…`);

  const translator = new deepl.Translator(apiKey);
  const skipped = [];

  for (const keyPath of todo) {
    const source = getPath(en, keyPath);

    // Lists (the testimonials) are translated item by item.
    const values = Array.isArray(source) ? source : [source];
    const output = [];

    for (const value of values) {
      const { text, placeholders } = protectPlaceholders(value);

      const result = await translator.translateText(text, "en", DEEPL_TARGET[target], {
        tagHandling: "xml",
        ignoreTags: ["ph"],
        // The app speaks to the reader plainly and warmly; "less" keeps Spanish
        // in tú-form rather than the distant usted.
        formality: "prefer_less",
      });

      output.push(restorePlaceholders(result.text, placeholders));
    }

    const translated = Array.isArray(source) ? output : output[0];

    if (!placeholdersIntact(source, Array.isArray(translated) ? translated.join(" ") : translated)) {
      skipped.push(keyPath);
      continue;
    }

    setPath(existing, keyPath, translated);
    console.log(`  ${keyPath}\n    ${JSON.stringify(translated)}`);
  }

  await writeFile(localePath(target), `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  if (skipped.length > 0) {
    console.warn(
      `\nSkipped ${skipped.length} key(s) whose placeholders came back changed:\n  ${skipped.join("\n  ")}\n` +
        "Translate these by hand — a broken {{placeholder}} shows the reader raw braces.",
    );
  }

  console.log(`\nWrote locales/${target}.json.`);
  console.log("This is a first pass. Have a native speaker read it before shipping.");
  console.log("\nStill to do by hand for a new language:");
  for (const [file, why] of Object.entries(NEVER_TRANSLATE)) {
    console.log(`  ${file} — ${why}`);
  }
  console.log("  then add the code to SUPPORTED_LOCALES on both sides.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
