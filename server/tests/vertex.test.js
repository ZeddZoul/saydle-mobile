import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * What actually goes over the wire.
 *
 * These tests exist because of a real bug: `generateAffirmations` destructured a
 * fixed parameter list, so `screenText` — the predicate deciding which of the
 * reader's own words may be sent — was silently dropped on the way to
 * `buildUserPrompt`, which then fell back to its permissive default. Everything
 * upstream looked correct; the crisis disclosure went to the model anyway.
 *
 * Asserting on the args passed *into* this service cannot catch that. Only the
 * outgoing request can.
 */
const generateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent };
      this.caches = { create: vi.fn() };
    }
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: "harassment",
    HARM_CATEGORY_HATE_SPEECH: "hate",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "sexual",
    HARM_CATEGORY_DANGEROUS_CONTENT: "dangerous",
  },
  HarmBlockThreshold: { BLOCK_MEDIUM_AND_ABOVE: "block" },
  Type: { OBJECT: "object", ARRAY: "array", STRING: "string" },
}));

vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    env: {
      ...actual.env,
      AI_ENABLED: true,
      AI_EXPLICIT_CACHE: false,
      GOOGLE_CLOUD_PROJECT: "test-project",
    },
  };
});

const { generateAffirmations, __resetCacheState } =
  await import("../src/services/vertex.service.js");

/** The single user-facing prompt string in the outgoing request. */
const sentPrompt = () => generateContent.mock.calls[0][0].contents[0].parts[0].text;

beforeEach(() => {
  generateContent.mockReset();
  __resetCacheState();
  generateContent.mockResolvedValue({
    text: JSON.stringify({ affirmations: [{ text: "I can rest today.", category: "calm" }] }),
  });
});

describe("generateAffirmations", () => {
  const profile = {
    goal: "finish my dissertation",
    weighing: "coping with self-harm urges",
  };

  it("honours the screen, leaving rejected text out of the request entirely", async () => {
    await generateAffirmations({
      count: 3,
      profile,
      screenText: (text) => !text.includes("self-harm"),
    });

    const prompt = sentPrompt();
    expect(prompt).toContain("finish my dissertation");
    // Not paraphrased, not summarised — absent.
    expect(prompt).not.toContain("self-harm");
    expect(prompt).not.toMatch(/weighing on them/i);
  });

  it("sends the reader's other words through unchanged", async () => {
    await generateAffirmations({ count: 3, profile, screenText: () => true });

    expect(sentPrompt()).toContain("coping with self-harm urges");
  });

  it("carries the language, so a Spanish reader gets Spanish", async () => {
    await generateAffirmations({ count: 3, language: "Spanish" });

    expect(sentPrompt()).toMatch(/in Spanish/);
  });

  it("carries the gentle instruction when the reader is having a hard time", async () => {
    await generateAffirmations({ count: 3, gentle: true });

    expect(sentPrompt()).toMatch(/tender time/i);
  });

  it("sends the system prompt inline when no cache is configured", async () => {
    await generateAffirmations({ count: 3 });

    const { config } = generateContent.mock.calls[0][0];
    expect(config.systemInstruction).toMatch(/You write daily affirmations/);
    expect(config.cachedContent).toBeUndefined();
  });

  it("asks for JSON against the response schema", async () => {
    await generateAffirmations({ count: 3 });

    const { config } = generateContent.mock.calls[0][0];
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseSchema).toBeTruthy();
    expect(config.safetySettings).toHaveLength(4);
  });

  it("reports a blocked response as unavailable rather than returning nothing", async () => {
    generateContent.mockResolvedValue({ text: "" });

    await expect(generateAffirmations({ count: 3 })).rejects.toThrow(/blocked/i);
  });

  it("reports unparseable output as unavailable", async () => {
    generateContent.mockResolvedValue({ text: "not json at all" });

    await expect(generateAffirmations({ count: 3 })).rejects.toThrow(/unparseable/i);
  });

  it("reports an empty batch rather than pretending it succeeded", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ affirmations: [] }) });

    await expect(generateAffirmations({ count: 3 })).rejects.toThrow(/empty batch/i);
  });

  it("wraps a transport failure so callers fall back to the curated bank", async () => {
    generateContent.mockRejectedValue(new Error("ECONNRESET"));

    await expect(generateAffirmations({ count: 3 })).rejects.toMatchObject({
      name: "AiUnavailableError",
    });
  });
});
