const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Keeps the widget extension's version identical to the app's.
 *
 * WHY THIS EXISTS
 *
 * App Store validation rejects a binary whose extension declares a different
 * CFBundleShortVersionString from its container. @bittingz/expo-widgets writes
 * the extension's Info.plist with the two version keys SWAPPED — its
 * `getKeyValues(shortVersion, bundleVersion)` is called as
 * `getKeyValues(bundleVersion, shortVersion)` — so a fresh prebuild ships an
 * extension at CFBundleShortVersionString "1" / CFBundleVersion "1.0.0" next to
 * an app at "1.0.0" / "1". Measured on a generated project, not inferred.
 *
 * The fix points both plist keys at the build settings
 * ($(MARKETING_VERSION) / $(CURRENT_PROJECT_VERSION)), which is what the app
 * target does, and pins those settings on the extension's configurations to
 * the app's values. EAS's remote versioning writes the build number into the
 * project's build settings, so routing through them is what keeps the two
 * targets moving together on every autoIncrement.
 *
 * It also renames the extension from the plugin's hardcoded "ExpoWidgets",
 * which is what iOS would otherwise show in Settings → Battery.
 */
const withWidgetVersion = (config, { target, displayName } = {}) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const platformRoot = cfg.modRequest.platformProjectRoot;

    const marketingVersion = cfg.version ?? "1.0.0";
    const buildNumber = String(cfg.ios?.buildNumber ?? "1");

    const targets = project.pbxNativeTargetSection();
    const entry = Object.entries(targets).find(
      ([, value]) => value?.name === target || value?.name === `"${target}"`,
    );
    if (!entry) {
      throw new Error(
        `withWidgetVersion: no target named "${target}". This must run after the widget plugin has created it.`,
      );
    }
    const [, nativeTarget] = entry;

    // Every build configuration the extension target owns.
    const configLists = project.hash.project.objects.XCConfigurationList ?? {};
    const buildConfigs = project.hash.project.objects.XCBuildConfiguration ?? {};
    const list = configLists[nativeTarget.buildConfigurationList];
    for (const ref of list?.buildConfigurations ?? []) {
      const settings = buildConfigs[ref.value]?.buildSettings;
      if (!settings) continue;
      settings.MARKETING_VERSION = marketingVersion;
      settings.CURRENT_PROJECT_VERSION = buildNumber;
      if (displayName) settings.INFOPLIST_KEY_CFBundleDisplayName = `"${displayName}"`;
    }

    const plistPath = path.join(platformRoot, target, "Info.plist");
    if (fs.existsSync(plistPath)) {
      let plist = fs.readFileSync(plistPath, "utf8");
      const setKey = (key, value) => {
        const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
        plist = re.test(plist)
          ? plist.replace(re, `$1${value}$2`)
          : plist.replace(
              "</dict>",
              `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>`,
            );
      };
      setKey("CFBundleShortVersionString", "$(MARKETING_VERSION)");
      setKey("CFBundleVersion", "$(CURRENT_PROJECT_VERSION)");
      if (displayName) setKey("CFBundleDisplayName", displayName);
      fs.writeFileSync(plistPath, plist);
    }

    return cfg;
  });

module.exports = withWidgetVersion;
