/**
 * Refuses to build a store or preview binary against placeholder configuration.
 *
 * Runs as the `eas-build-pre-install` hook (see package.json), i.e. on the EAS
 * builder before anything is compiled. EXPO_PUBLIC_* values are inlined into the
 * JS bundle at build time, so whatever is set here is what ships — a build cut
 * with the API pointed at localhost or a RevenueCat Test Store key is a binary
 * nobody can use, and App Review rejects the latter outright. Failing here
 * costs seconds; failing in review costs a week.
 *
 * Values come from EAS environment variables (eas.dev → project → Environment
 * variables), one set per profile. Nothing sensitive lives in eas.json.
 */
const profile = process.env.EAS_BUILD_PROFILE ?? "";
const platform = process.env.EAS_BUILD_PLATFORM ?? "";
const gated = profile === "production" || profile === "preview";

if (!gated) {
  console.log(`check-release-env: profile "${profile || "local"}" is not gated.`);
  process.exit(0);
}

const problems = [];
const env = (name) => (process.env[name] ?? "").trim();

const api = env("EXPO_PUBLIC_API_URL");
if (!api) problems.push("EXPO_PUBLIC_API_URL is unset.");
else if (!/^https:\/\//.test(api))
  problems.push(`EXPO_PUBLIC_API_URL must be https, got "${api}".`);
else if (/localhost|127\.0\.0\.1|10\.0\.2\.2|example\.com|REPLACE-ME/i.test(api))
  problems.push(`EXPO_PUBLIC_API_URL still points at a placeholder: "${api}".`);

const keyName =
  platform === "android"
    ? "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"
    : "EXPO_PUBLIC_REVENUECAT_IOS_KEY";
const key = env(keyName);
if (!key)
  problems.push(
    `${keyName} is unset — the paywall would show no plans and IAP could not be reviewed.`,
  );
else if (key.startsWith("test_"))
  problems.push(
    `${keyName} is a RevenueCat Test Store key; App Review rejects those and the SDK refuses them outside development.`,
  );

if (platform === "ios" && !env("APPLE_TEAM_ID"))
  problems.push("APPLE_TEAM_ID is unset — the widget extension cannot be signed.");

for (const name of ["EXPO_PUBLIC_PRIVACY_URL", "EXPO_PUBLIC_TERMS_URL"]) {
  const value = env(name);
  if (value && !/^https:\/\//.test(value))
    problems.push(`${name} must be https, got "${value}".`);
}

if (problems.length > 0) {
  console.error(`check-release-env: refusing to build profile "${profile}" for ${platform}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`check-release-env: profile "${profile}" for ${platform} looks releasable.`);
