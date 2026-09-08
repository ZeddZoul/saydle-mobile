import { describe, it, expect, vi } from "vitest";
import { bootstrapGoogleCredentials } from "../src/config/googleCredentials.js";

/**
 * The Railway path for Vertex auth: the key arrives as an env var, becomes a
 * file at boot, and GOOGLE_APPLICATION_CREDENTIALS points at it. What matters
 * is precedence (an explicit path always wins), and failing loudly on a bad
 * paste rather than letting Vertex 403 twenty minutes later.
 */
const KEY = JSON.stringify({
  type: "service_account",
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

const fakeIo = () => ({ writeFileSync: vi.fn() });

describe("bootstrapGoogleCredentials", () => {
  it("writes the inline key to disk and points the path variable at it", () => {
    const env = { GOOGLE_CREDENTIALS_JSON: KEY };
    const io = fakeIo();

    const result = bootstrapGoogleCredentials(env, io, () => "/tmp");

    expect(result.applied).toBe(true);
    expect(io.writeFileSync).toHaveBeenCalledWith(
      "/tmp/gcp-service-account.json",
      KEY,
      // Readable by this process only; the key is the thing most likely to leak.
      { mode: 0o600 },
    );
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe("/tmp/gcp-service-account.json");
  });

  it("defers to an explicit GOOGLE_APPLICATION_CREDENTIALS", () => {
    // Local development has a real key file; the inline var must never
    // clobber it.
    const env = {
      GOOGLE_APPLICATION_CREDENTIALS: "/keys/local.json",
      GOOGLE_CREDENTIALS_JSON: KEY,
    };
    const io = fakeIo();

    const result = bootstrapGoogleCredentials(env, io, () => "/tmp");

    expect(result.applied).toBe(false);
    expect(io.writeFileSync).not.toHaveBeenCalled();
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe("/keys/local.json");
  });

  it("does nothing when neither variable is set", () => {
    const env = {};
    const result = bootstrapGoogleCredentials(env, fakeIo(), () => "/tmp");

    expect(result.applied).toBe(false);
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  });

  it("refuses a truncated paste loudly", () => {
    const env = { GOOGLE_CREDENTIALS_JSON: '{"client_email": "svc@' };

    // The alternative is Vertex quietly 403ing and the product degrading to
    // the curated bank with nothing logged about why.
    expect(() => bootstrapGoogleCredentials(env, fakeIo(), () => "/tmp")).toThrow(
      /not valid JSON/,
    );
  });

  it("refuses JSON that is not a service account key", () => {
    const env = { GOOGLE_CREDENTIALS_JSON: '{"hello": "world"}' };

    expect(() => bootstrapGoogleCredentials(env, fakeIo(), () => "/tmp")).toThrow(
      /does not look like a service account key/,
    );
  });
});
