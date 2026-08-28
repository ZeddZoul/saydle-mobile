import { describe, it, expect } from "vitest";
import {
  checkAffirmation,
  filterAffirmations,
  focusNeedsCare,
} from "../src/services/moderation.service.js";
import { CURATED_AFFIRMATIONS, curatedFor } from "../src/data/curated.js";
import { SUPPORTED_LOCALES } from "../src/config/locales.js";

describe("checkAffirmation", () => {
  it("accepts a well-formed affirmation", () => {
    expect(checkAffirmation("I am allowed to start small.")).toEqual({ ok: true });
  });

  it.each([
    ["", "empty"],
    ["I am.", "too few words"],
    ["You are doing great today.", "second person"],
    ["Remember to breathe deeply now.", "does not open in first person"],
    ["I am unstoppable today and always.", "banned vocabulary"],
    ["I am so proud of myself!", "question or exclamation"],
    ["I am calm 🌸 today and steady.", "emoji"],
    ["I am winning #blessed today always", "forbidden topic"],
  ])("rejects %j", (text) => {
    expect(checkAffirmation(text).ok).toBe(false);
  });

  it("rejects clinical and crisis content however it is phrased", () => {
    const samples = [
      "I am beating my depression every single day.",
      "I will reach my goal weight this month.",
      "My medication is working perfectly for me.",
      "I am healing my trauma completely today.",
    ];

    for (const text of samples) {
      expect(checkAffirmation(text).ok, text).toBe(false);
    }
  });

  it("rejects anything over the length ceiling", () => {
    const long = `I am ${"very ".repeat(30)}calm.`;
    expect(checkAffirmation(long).ok).toBe(false);
  });
});

describe("filterAffirmations", () => {
  it("splits approved from rejected and records a reason", () => {
    const { approved, rejected } = filterAffirmations([
      { text: "I am enough as I am.", category: "self-worth" },
      { text: "You are enough as you are.", category: "self-worth" },
    ]);

    expect(approved).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("second person");
  });

  it("drops duplicates within a batch, case-insensitively", () => {
    const { approved, rejected } = filterAffirmations([
      { text: "I am steady today.", category: "calm" },
      { text: "i am steady today.", category: "calm" },
    ]);

    expect(approved).toHaveLength(1);
    expect(rejected[0].reason).toBe("duplicate within batch");
  });
});

describe("focusNeedsCare", () => {
  it("flags crisis and clinical focus text", () => {
    expect(focusNeedsCare("I want to stop self-harm")).toBe(true);
    expect(focusNeedsCare("dealing with my anxiety disorder")).toBe(true);
  });

  it("leaves ordinary focus text alone", () => {
    expect(focusNeedsCare("being more patient with my kids")).toBe(false);
    expect(focusNeedsCare("")).toBe(false);
  });
});

describe("the curated bank", () => {
  // The bank is the fallback for outages, moderation failures, and users whose
  // focus routes away from generation. If a line here fails moderation, that
  // fallback ships broken content.
  it("passes moderation on every line, in its own language", () => {
    // English rules say nothing about Spanish text, so each line is checked
    // against the rules for the language it was written in.
    const failures = CURATED_AFFIRMATIONS.map(({ text, locale }) => ({
      text,
      locale,
      ...checkAffirmation(text, locale),
    })).filter((r) => !r.ok);

    expect(failures).toEqual([]);
  });

  it("ships a bank for every language the gate advertises", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(curatedFor(locale).length, `${locale} has no curated bank`).toBeGreaterThan(20);
    }
  });

  it("has no duplicates", () => {
    const keys = CURATED_AFFIRMATIONS.map((a) => a.text.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
