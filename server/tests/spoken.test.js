import { describe, it, expect } from "vitest";
import { spokenFor, stripName } from "../src/services/spoken.service.js";

/**
 * The written line and the spoken line are not the same sentence.
 *
 * An affirmation is written for the reader to say to themselves. Read aloud by
 * someone else it has to move to the second person, or the voice is claiming
 * the sentence for itself. And the reader's name has to come out — a synthetic
 * voice mispronounces most names that are not Anglo, it is the one word they
 * would catch, and a line carrying a name can never be shared between readers,
 * which is the cache's whole premise.
 */
describe("spokenFor", () => {
  it("moves the sentence to the second person", () => {
    expect(spokenFor("I am allowed to take up space.")).toBe(
      "You are allowed to take up space.",
    );
  });

  it("agrees the verb, which is the only one that changes", () => {
    expect(spokenFor("I am enough.")).toBe("You are enough.");
    expect(spokenFor("I was doing my best.")).toBe("You were doing your best.");
    // can / will / do / have are identical for I and you — the lucky part.
    expect(spokenFor("I can begin again.")).toBe("You can begin again.");
  });

  it("handles contractions", () => {
    expect(spokenFor("I'm allowed to change my mind.")).toBe(
      "You're allowed to change your mind.",
    );
    expect(spokenFor("I've done enough today.")).toBe("You've done enough today.");
    expect(spokenFor("I'll get there.")).toBe("You'll get there.");
  });

  it("turns the possessives around too", () => {
    expect(spokenFor("My worth is a given, not something I earn.")).toBe(
      "Your worth is a given, not something you earn.",
    );
    expect(spokenFor("I can be gentle with the part of me that is afraid.")).toBe(
      "You can be gentle with the part of you that is afraid.",
    );
    expect(spokenFor("The pace is mine to set.")).toBe("The pace is yours to set.");
    expect(spokenFor("I do not owe myself an explanation.")).toBe(
      "You do not owe yourself an explanation.",
    );
  });

  it("recapitalises, since every replacement is lowercase", () => {
    expect(spokenFor("I am here. I am enough.")).toBe("You are here. You are enough.");
  });

  it("leaves a line already in the second person alone", () => {
    // Which is what makes it safe to run over the curated bank unaudited.
    const line = "You are already enough.";
    expect(spokenFor(line)).toBe(line);
  });

  it("removes the reader's name", () => {
    expect(spokenFor("Ada, I can begin again on a Tuesday.", { name: "Ada" })).toBe(
      "You can begin again on a Tuesday.",
    );
    expect(
      spokenFor("I do not have to earn my own kindness, Chidinma.", { name: "Chidinma" }),
    ).toBe("You do not have to earn your own kindness.");
  });

  it("survives an empty or missing name", () => {
    expect(spokenFor("I am enough.", { name: "" })).toBe("You are enough.");
    expect(spokenFor("I am enough.", {})).toBe("You are enough.");
    expect(spokenFor("I am enough.")).toBe("You are enough.");
  });

  it("handles nothing at all", () => {
    expect(spokenFor("")).toBe("");
    expect(spokenFor(null)).toBe("");
    expect(spokenFor(undefined)).toBe("");
  });
});

describe("stripName", () => {
  it("takes the name only where it is an address", () => {
    expect(stripName("Ada, you can rest.", "Ada")).toBe("You can rest.");
    expect(stripName("You can rest, Ada.", "Ada")).toBe("You can rest.");
    expect(stripName("You can rest — Ada — today.", "Ada")).toBe("You can rest, today.");
  });

  it("leaves a name that is also an ordinary word inside the sentence", () => {
    // Hope, Grace, Faith, Precious and Blessing are all common names. Gutting
    // the sentence they appear in would be worse than saying the name.
    expect(stripName("Hope is not something you have to justify.", "Hope")).toBe(
      "Hope is not something you have to justify.",
    );
    expect(stripName("Grace is a thing you can give yourself.", "Grace")).toBe(
      "Grace is a thing you can give yourself.",
    );
  });

  it("matches regardless of case", () => {
    expect(stripName("ADA, you can rest.", "Ada")).toBe("You can rest.");
  });

  it("does not break on a name containing regex characters", () => {
    // A crash here would take down every session for that reader.
    expect(() => stripName("You can rest.", "A.(b)*")).not.toThrow();
    expect(stripName("A.(b)*, you can rest.", "A.(b)*")).toBe("You can rest.");
  });

  it("returns the line untouched with no name", () => {
    expect(stripName("You can rest.", "")).toBe("You can rest.");
    expect(stripName("You can rest.", null)).toBe("You can rest.");
  });
});
