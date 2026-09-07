import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

/**
 * The documents both stores require before an app can be submitted. They are
 * public by design — store reviewers and people deciding whether to sign up
 * are exactly the readers — so the one thing that would quietly break a
 * submission is these ever ending up behind auth or off their URLs.
 */
describe("the legal pages", () => {
  it("serves the privacy policy publicly, as a page", async () => {
    const res = await request(app).get("/legal/privacy");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Privacy Policy");
  });

  it("serves the terms publicly, as a page", async () => {
    const res = await request(app).get("/legal/terms");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Terms of Use");
  });

  it("says plainly that Saydle is not a medical service", async () => {
    // The claim App Review 5.1.1 and common decency both require of a
    // wellbeing app. Losing this line is losing the submission.
    const res = await request(app).get("/legal/terms");
    expect(res.text).toContain("not a medical or mental-health service");
  });

  it("names every processor the privacy policy owes a mention", async () => {
    const res = await request(app).get("/legal/privacy");

    for (const processor of ["MongoDB", "Vertex", "ElevenLabs", "RevenueCat", "Resend"]) {
      expect(res.text).toContain(processor);
    }
  });

  it("describes deletion the way the code actually behaves", async () => {
    // 30-day grace, cancel by signing back in, hashed-email tombstone — the
    // policy must match deletion.service.js, not a template.
    const res = await request(app).get("/legal/privacy");
    expect(res.text).toContain("30 days");
    expect(res.text).toContain("hashed");
  });

  it("states the auto-renewal terms Apple requires near a subscription", async () => {
    const res = await request(app).get("/legal/terms");
    expect(res.text).toContain("auto-renewing");
    expect(res.text).toContain("24 hours");
  });
});
