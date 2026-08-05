import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../migrations/seed.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { resolveLocale, isSupportedLocale, SUPPORTED_LOCALES } from "../src/config/locales.js";
import { curatedFor } from "../src/data/curated.js";
import { checkAffirmation, focusNeedsCare } from "../src/services/moderation.service.js";
import { buildUserPrompt } from "../src/prompts/affirmation.prompt.js";

const app = createApp();

beforeEach(async () => {
  await seed();
});

describe("the language gate", () => {
  it("only advertises languages we can actually moderate", () => {
    // Every supported locale must have moderation rules, or its affirmations
    // would pass unchecked. This test is the guard on that invariant.
    for (const locale of SUPPORTED_LOCALES) {
      const result = checkAffirmation("I am allowed to rest today.", locale);
      expect(result.reason, `${locale} has no moderation rules`).not.toBe(
        "unsupported language",
      );
    }
  });

  it("ships a curated bank for every language it advertises", () => {
    // Rules alone aren't enough: with no bank, an outage or a rejected batch
    // would leave a Spanish reader with nothing, or with English.
    for (const locale of SUPPORTED_LOCALES) {
      expect(curatedFor(locale).length, `${locale} has no curated bank`).toBeGreaterThan(20);
    }
  });

  it("falls back to the default for anything unsupported", () => {
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(isSupportedLocale("fr")).toBe(false);
  });
});

describe("moderation without rules for a language", () => {
  it("approves nothing rather than passing content unchecked", () => {
    const result = checkAffirmation("Je peux commencer avant d'être prêt.", "fr");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unsupported language");
  });

  it("treats unreadable focus text as needing care", () => {
    // If we can't screen it, we don't send it to the model.
    expect(focusNeedsCare("n'importe quoi", "fr")).toBe(true);
  });

  it("still screens focus text normally in a supported language", () => {
    expect(focusNeedsCare("being braver at work", "en")).toBe(false);
    expect(focusNeedsCare("coping with self-harm urges", "en")).toBe(true);
    expect(focusNeedsCare("quiero estar más tranquilo", "es")).toBe(false);
    expect(focusNeedsCare("estoy en terapia con mi terapeuta", "es")).toBe(true);
  });
});

describe("Spanish moderation", () => {
  const check = (text) => checkAffirmation(text, "es");

  it("accepts natural pro-drop first person", () => {
    // No pronoun anywhere — the person is carried by the verb, which is why the
    // English "starts with I" rule cannot simply be reused.
    expect(check("Puedo descansar antes de terminar.").ok).toBe(true);
    expect(check("Me permito ir más despacio.").ok).toBe(true);
    expect(check("Hoy elijo una intención honesta.").ok).toBe(true);
  });

  it("rejects the second person in all its forms", () => {
    expect(check("Tú eres suficiente hoy.").reason).toBe("second person");
    expect(check("Puedo confiar en ti hoy.").reason).toBe("second person");
    expect(check("Te permito descansar hoy.").reason).toBe("second person");
  });

  it("rejects Spanish crisis and clinical vocabulary", () => {
    expect(check("Puedo vivir con mi depresión hoy.").reason).toBe("forbidden topic");
    expect(check("Mi terapeuta dice que puedo.").reason).toBe("forbidden topic");
    expect(check("Puedo aceptar mi cuerpo hoy.").reason).toBe("forbidden topic");
  });

  it("rejects inverted Spanish punctuation as well as the closing marks", () => {
    expect(check("¿Puedo descansar hoy?").reason).toBe("question or exclamation");
    expect(check("¡Puedo con esto hoy!").reason).toBe("question or exclamation");
  });

  it("rejects the wellness lexicon in Spanish too", () => {
    expect(check("Puedo manifestar abundancia hoy.").reason).toBe("banned vocabulary");
    expect(check("Soy imparable en mi camino.").reason).toBe("banned vocabulary");
  });

  it("rejects a sentence that never reaches the first person", () => {
    expect(check("La vida siempre encuentra su camino.").reason).toBe(
      "does not open in first person",
    );
  });
});

describe("the generation prompt", () => {
  it("asks for the language and restates that the rules still apply", () => {
    const prompt = buildUserPrompt({ count: 3, language: "Spanish" });

    expect(prompt).toMatch(/in Spanish/);
    expect(prompt).toMatch(/rules? above still applies?/i);
  });

  it("says nothing about language by default", () => {
    expect(buildUserPrompt({ count: 3 })).not.toMatch(/Write them in/);
  });
});

describe("changing language", () => {
  it("stores a supported language and reports it back", async () => {
    const { auth } = await registerUser(app, { email: "switch@example.com" });

    const res = await request(app)
      .patch("/api/preferences")
      .set("Authorization", auth)
      .send({ locale: "es" });

    expect(res.status).toBe(200);
    expect(res.body.locale).toBe("es");
  });

  it("refuses a language it cannot moderate, rather than falling back quietly", async () => {
    const { auth } = await registerUser(app, { email: "unsupported@example.com" });

    const res = await request(app)
      .patch("/api/preferences")
      .set("Authorization", auth)
      .send({ locale: "fr" });

    // A reader who asked for French should be told we don't have it, not handed
    // English and left to wonder.
    expect(res.status).toBe(400);
  });

  it("serves the new language's curated bank from the next day on", async () => {
    const { auth } = await registerUser(app, { email: "bank@example.com" });

    await request(app)
      .patch("/api/preferences")
      .set("Authorization", auth)
      .send({ locale: "es" });

    const feed = await request(app)
      .get("/api/affirmations/feed?days=7")
      .set("Authorization", auth);

    expect(feed.status).toBe(200);
    expect(feed.body.entries.length).toBeGreaterThan(0);

    const spanish = new Set(curatedFor("es").map((a) => a.text));
    const english = new Set(curatedFor("en").map((a) => a.text));

    for (const entry of feed.body.entries) {
      expect(english.has(entry.affirmation.text)).toBe(false);
      expect(spanish.has(entry.affirmation.text)).toBe(true);
    }
  });
});

describe("registration", () => {
  it("stores a supported locale", async () => {
    await registerUser(app, { locale: "en" });
    const user = await User.findOne({ locale: "en" });
    expect(user).toBeTruthy();
  });

  it("falls back to English for an unsupported locale", async () => {
    const res = await request(app).post("/api/auth/register").send({
      firstName: "Ada",
      email: "locale-test@example.com",
      password: "correct horse battery",
      locale: "xx",
    });

    expect(res.status).toBe(201);
    const user = await User.findById(res.body.user.id);
    expect(user.locale).toBe("en");
  });
});
