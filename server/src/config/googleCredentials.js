import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Vertex authentication on hosts that only speak environment variables.
 *
 * Google's libraries want GOOGLE_APPLICATION_CREDENTIALS: a *path* to a key
 * file. Cloud Run sidesteps the file entirely by attaching a service account,
 * but platforms like Railway have no attached identities and no secret files,
 * only env vars. So the deploy pastes the key's JSON into
 * GOOGLE_CREDENTIALS_JSON, and this writes it to disk at boot and points the
 * path variable at it, before anything Google reads either.
 *
 * Written 0600 into the platform's tmpdir: readable by this process, gone with
 * the container. An explicit GOOGLE_APPLICATION_CREDENTIALS always wins, so
 * local development (a real key file on disk) is untouched.
 */
export function bootstrapGoogleCredentials(env = process.env, io = fs, tmpdir = os.tmpdir) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return { applied: false, reason: "path already set" };
  if (!env.GOOGLE_CREDENTIALS_JSON) return { applied: false, reason: "no inline key" };

  let parsed;
  try {
    parsed = JSON.parse(env.GOOGLE_CREDENTIALS_JSON);
  } catch {
    // A truncated paste. Refusing loudly here beats Vertex failing with a 403
    // twenty minutes later and the service silently degrading to the bank.
    throw new Error(
      "GOOGLE_CREDENTIALS_JSON is set but is not valid JSON - re-paste the service account key.",
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GOOGLE_CREDENTIALS_JSON parsed but does not look like a service account key (missing client_email or private_key).",
    );
  }

  const dest = path.join(tmpdir(), "gcp-service-account.json");
  io.writeFileSync(dest, env.GOOGLE_CREDENTIALS_JSON, { mode: 0o600 });
  env.GOOGLE_APPLICATION_CREDENTIALS = dest;

  return { applied: true, path: dest };
}
