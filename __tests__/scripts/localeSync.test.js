import {
  getPath,
  leafPaths,
  missingPaths,
  placeholdersIntact,
  protectPlaceholders,
  restorePlaceholders,
  setPath,
  NEVER_TRANSLATE,
} from "../../scripts/localeSync.js";

const en = {
  common: { skip: "Skip", back: "Back" },
  today: { greeting: "Hello, {{name}}" },
  landing: { testimonials: ["One.", "Two."] },
};

describe("walking a locale file", () => {
  it("finds every leaf, treating a list as one value", () => {
    expect(leafPaths(en)).toEqual([
      "common.skip",
      "common.back",
      "today.greeting",
      "landing.testimonials",
    ]);
  });

  it("reads and writes nested paths, creating what's missing", () => {
    const target = {};
    setPath(target, "today.greeting", "Hola, {{name}}");

    expect(getPath(target, "today.greeting")).toBe("Hola, {{name}}");
    expect(getPath(target, "nope.missing")).toBeUndefined();
  });
});

describe("missingPaths", () => {
  it("lists only what the target has not got", () => {
    const es = { common: { skip: "Omitir" } };
    expect(missingPaths(en, es)).toEqual([
      "common.back",
      "today.greeting",
      "landing.testimonials",
    ]);
  });

  it("never re-translates a key that already has a value", () => {
    // The existing value has been read by a human; overwriting undoes that.
    const es = { common: { skip: "Omitir", back: "Atrás" } };
    expect(missingPaths(en, es)).not.toContain("common.skip");
  });

  it("returns nothing when the translation is complete", () => {
    const es = {
      common: { skip: "Omitir", back: "Atrás" },
      today: { greeting: "Hola, {{name}}" },
      landing: { testimonials: ["Uno.", "Dos."] },
    };
    expect(missingPaths(en, es)).toEqual([]);
  });
});

describe("placeholder protection", () => {
  it("hides placeholders behind a tag the translator is told to skip", () => {
    const { text, placeholders } = protectPlaceholders("Hello, {{name}}");

    expect(text).toBe('Hello, <ph id="0"/>');
    expect(placeholders).toEqual(["{{name}}"]);
  });

  it("round-trips several placeholders in the right order", () => {
    const source = "{{count}} a day between {{start}} and {{end}}";
    const { text, placeholders } = protectPlaceholders(source);

    // Simulating the translator: prose changes, tags survive, order shifts.
    const translated = text.replace("a day between", "al día entre");

    expect(restorePlaceholders(translated, placeholders)).toBe(
      "{{count}} al día entre {{start}} and {{end}}",
    );
  });

  it("leaves a string with no placeholders alone", () => {
    const { text, placeholders } = protectPlaceholders("Skip");
    expect(text).toBe("Skip");
    expect(placeholders).toEqual([]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(protectPlaceholders("Hi {{ name }}").placeholders).toEqual(["{{ name }}"]);
  });

  it("leaves an unknown tag index untouched rather than deleting it", () => {
    expect(restorePlaceholders('Hola, <ph id="7"/>', ["{{name}}"])).toBe('Hola, <ph id="7"/>');
  });
});

describe("placeholdersIntact", () => {
  it("accepts a translation that kept every placeholder", () => {
    expect(placeholdersIntact("Hello, {{name}}", "Hola, {{name}}")).toBe(true);
  });

  it("accepts placeholders that moved", () => {
    // Word order differs between languages; only the set has to match.
    expect(placeholdersIntact("{{start}} to {{end}}", "hasta {{end}} desde {{start}}")).toBe(
      true,
    );
  });

  it("rejects a translated placeholder name", () => {
    // The classic failure: i18next can never fill {{nombre}}, so the reader
    // sees the raw braces.
    expect(placeholdersIntact("Hello, {{name}}", "Hola, {{nombre}}")).toBe(false);
  });

  it("rejects a dropped placeholder", () => {
    expect(placeholdersIntact("Hello, {{name}}", "Hola")).toBe(false);
  });
});

describe("what the script refuses to touch", () => {
  it("keeps the affirmation bank and the safety rules off the table", () => {
    // Neither is prose a translator can help with — see lib/i18n.js.
    expect(Object.keys(NEVER_TRANSLATE)).toEqual([
      "server/src/data/curated.js",
      "server/src/services/moderation.service.js",
    ]);
  });
});
