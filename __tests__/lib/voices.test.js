import { DEFAULT_VOICE, VOICES, suggestedVoice, voiceByKey } from "../../lib/voices.js";

/**
 * The catalogue is data, so the tests are about the contract the rest of the
 * app leans on: five distinct keys, every one carrying speech parameters, and
 * a lookup that cannot hand back undefined.
 */
describe("voices", () => {
  it("ships the five archetypes, with unique keys", () => {
    expect(VOICES).toHaveLength(5);

    const keys = VOICES.map((v) => v.key);
    expect(new Set(keys).size).toBe(5);
    expect(keys).toEqual(
      expect.arrayContaining(["father", "mentor", "peer", "mother", "grandmother"]),
    );
  });

  it("gives every voice speech parameters, so the placeholder is audible", () => {
    for (const voice of VOICES) {
      expect(typeof voice.speech.pitch).toBe("number");
      expect(typeof voice.speech.rate).toBe("number");
      // Anything outside this is unintelligible on a device.
      expect(voice.speech.rate).toBeGreaterThan(0.4);
      expect(voice.speech.rate).toBeLessThanOrEqual(1.2);
    }
  });

  it("leaves the ElevenLabs slot empty and present", () => {
    // Present, so filling it is an edit rather than a redesign.
    for (const voice of VOICES) {
      expect(voice).toHaveProperty("elevenLabsId", null);
    }
  });

  it("sounds different between archetypes", () => {
    // Two archetypes with identical parameters would be a picker that lies.
    const params = VOICES.map((v) => `${v.speech.pitch}/${v.speech.rate}`);
    expect(new Set(params).size).toBe(5);
  });

  describe("voiceByKey", () => {
    it("finds a voice", () => {
      expect(voiceByKey("father").key).toBe("father");
    });

    it("never returns undefined for an unknown key", () => {
      // A stored preference can outlive the voice it names — a renamed or
      // retired archetype must degrade to a working voice, not crash Practice.
      expect(voiceByKey("retired-in-v2")).toBe(VOICES[0]);
      expect(voiceByKey(undefined)).toBe(VOICES[0]);
    });
  });

  describe("suggestedVoice", () => {
    it("maps each onboarding tone to a voice", () => {
      expect(suggestedVoice("gentle")).toBe("mother");
      expect(suggestedVoice("grounded")).toBe("father");
      expect(suggestedVoice("energetic")).toBe("peer");
    });

    it("falls back for a tone nobody chose", () => {
      expect(suggestedVoice(undefined)).toBe(DEFAULT_VOICE);
      expect(suggestedVoice("brand-new-tone")).toBe(DEFAULT_VOICE);
    });

    it("only ever suggests a voice that exists", () => {
      const keys = VOICES.map((v) => v.key);
      for (const tone of ["gentle", "grounded", "energetic", undefined]) {
        expect(keys).toContain(suggestedVoice(tone));
      }
    });
  });
});
