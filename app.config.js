/**
 * Dynamic layer over app.json.
 *
 * app.json is static JSON and Expo performs no variable substitution in it, so
 * a value like "$APPLE_TEAM_ID" would reach Xcode as that literal string. The
 * only thing this file does is inject build-time environment into the places
 * that need it; everything declarative stays in app.json where `expo config`
 * and EAS can read it without executing code.
 *
 *   APPLE_TEAM_ID  signs the widget extension. Set it as an EAS environment
 *                  variable for the preview and production profiles (and in
 *                  .env locally for `expo run:ios`). scripts/check-release-env.mjs
 *                  refuses a store build without it.
 */
module.exports = ({ config }) => {
  const teamId = (process.env.APPLE_TEAM_ID ?? "").trim();

  const plugins = (config.plugins ?? []).map((entry) => {
    if (!Array.isArray(entry) || entry[0] !== "@bittingz/expo-widgets") return entry;
    const [name, options = {}] = entry;
    return [
      name,
      {
        ...options,
        ios: {
          ...options.ios,
          devTeamId: teamId || options.ios?.devTeamId || "",
        },
      },
    ];
  });

  return { ...config, plugins };
};
