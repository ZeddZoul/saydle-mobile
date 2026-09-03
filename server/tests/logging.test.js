import { describe, it, expect } from "vitest";
import { serializers } from "../src/lib/logger.js";
import { emailFingerprint } from "../src/lib/pii.js";

/**
 * What reaches the logs.
 *
 * A request line used to carry every header and the remote address — a
 * client IP and a user agent per request, kept for as long as the sink keeps
 * anything. Now it carries an id, a method and a path, and an email only ever
 * appears as a fingerprint.
 */
describe("request logging", () => {
  it("logs an id, a method and a path, and nothing about who", () => {
    const out = serializers.req({
      id: "r1",
      method: "POST",
      url: "/api/auth/forgot-password",
      headers: { "user-agent": "Saydle/1.0", "x-forwarded-for": "203.0.113.9" },
      remoteAddress: "203.0.113.9",
      remotePort: 51234,
    });

    expect(out).toEqual({ id: "r1", method: "POST", url: "/api/auth/forgot-password" });
  });

  it("logs a response as its status code only", () => {
    expect(serializers.res({ statusCode: 204, headers: { "set-cookie": "x" } })).toEqual({
      statusCode: 204,
    });
  });
});

describe("emailFingerprint", () => {
  it("is stable for the same address however it is written", () => {
    expect(emailFingerprint("Ada@Example.com ")).toBe(emailFingerprint("ada@example.com"));
  });

  it("differs between addresses and reveals neither", () => {
    const a = emailFingerprint("ada@example.com");
    const b = emailFingerprint("bob@example.com");
    expect(a).not.toBe(b);
    expect(a).not.toContain("ada");
    expect(a).toHaveLength(16);
  });

  it("copes with nothing", () => {
    expect(emailFingerprint(undefined)).toBeNull();
  });
});
