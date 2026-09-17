import { describe, it, expect } from "vitest";
import { buildEmail } from "../src/services/emailTemplate.js";

const base = {
  greeting: "Hi Atlas,",
  paragraphs: ["It expires in 15 minutes.", "If you didn't ask for it, ignore this."],
};

describe("buildEmail", () => {
  it("returns both halves of the message", () => {
    const { html, text } = buildEmail(base);
    expect(html).toContain("<!doctype html>");
    expect(text).not.toContain("<");
  });

  it("puts every paragraph in both halves, so they cannot drift", () => {
    const { html, text } = buildEmail(base);
    for (const p of base.paragraphs) {
      expect(text).toContain(p);
      expect(html).toContain(p);
    }
    expect(text).toContain(base.greeting);
    expect(html).toContain(base.greeting);
  });

  it("carries a code and its caption when given one", () => {
    const { html, text } = buildEmail({
      ...base,
      code: "617742",
      codeCaption: "Password reset code",
    });
    expect(html).toContain("617742");
    expect(html).toContain("Password reset code");
    expect(text).toContain("Password reset code: 617742");
  });

  it("omits the code panel entirely when there is no code", () => {
    // The deletion mails have nothing to display there; an empty tinted box
    // would read as a rendering failure.
    const { html, text } = buildEmail(base);
    expect(html).not.toContain("letter-spacing:0.14em");
    expect(text).not.toMatch(/^\s*:\s*$/m);
  });

  it("hides the preheader from the body but keeps it for the client", () => {
    const withIt = buildEmail({ ...base, preheader: "Expires in 15 minutes." });
    expect(withIt.html).toContain("Expires in 15 minutes.");
    expect(withIt.html).toContain("mso-hide:all");
    // Never in the text part, where it would read as a stray duplicate line.
    expect(withIt.text).not.toContain("Expires in 15 minutes.");

    expect(buildEmail(base).html).not.toContain("mso-hide:all");
  });

  it("escapes content rather than trusting it", () => {
    // firstName reaches the greeting straight from the profile, so it is user
    // input arriving in a document other people render.
    const { html } = buildEmail({
      ...base,
      greeting: 'Hi <script>alert("x")</script>,',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("names the brand and the site in the text part", () => {
    // The plain-text half is what a watch notification and a screen reader get,
    // so it has to stand on its own rather than assume the HTML was seen.
    const { text } = buildEmail(base);
    expect(text.trimEnd().endsWith("saydle.com")).toBe(true);
    expect(text).toContain("Saydle");
  });

  it("asks Fraunces first and falls back to a real serif", () => {
    // Gmail and Outlook will not fetch the webfont; the fallback is what most
    // recipients actually see, so it must be deliberate rather than generic.
    const { html } = buildEmail(base);
    expect(html).toContain("'Fraunces'");
    expect(html).toContain("Georgia");
  });
});
