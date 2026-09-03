const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Ships a PrivacyInfo.xcprivacy inside the widget extension.
 *
 * WHY THIS EXISTS
 *
 * The extension reads the App Group's UserDefaults suite (SaydleShared.swift),
 * which Apple classes as a "required reason" API. Every bundle that uses one —
 * the app AND each extension — needs its own privacy manifest, or App Store
 * Connect rejects the upload (ITMS-91053). Expo writes the app's manifest from
 * `ios.privacyManifests` in app.json, but nothing writes one for the extension:
 * @bittingz/expo-widgets copies only .swift/.plist/.xcassets/.entitlements/
 * .intentdefinition/.strings out of widgets/ios (see its
 * WidgetProjectFileCollection), so an .xcprivacy dropped there is ignored.
 *
 * So this copies the file into the generated extension folder and registers it
 * by hand: one PBXFileReference in the extension's group, one PBXBuildFile in
 * the extension's Resources phase. The phase is found by section membership
 * rather than by its "Resources" comment for the same reason withWidgetFonts
 * does it that way — the widget plugin labels its phase differently.
 */
const withWidgetPrivacyManifest = (config, { target, manifest } = {}) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectRoot = cfg.modRequest.projectRoot;
    const platformRoot = cfg.modRequest.platformProjectRoot;

    const source = path.resolve(projectRoot, manifest);
    if (!fs.existsSync(source)) {
      throw new Error(`withWidgetPrivacyManifest: ${manifest} does not exist.`);
    }

    const targets = project.pbxNativeTargetSection();
    const entry = Object.entries(targets).find(
      ([, value]) => value?.name === target || value?.name === `"${target}"`,
    );
    if (!entry) {
      throw new Error(
        `withWidgetPrivacyManifest: no target named "${target}". This must run after the widget plugin has created it.`,
      );
    }
    const [, nativeTarget] = entry;

    // Copy next to the extension's own sources so the relative path below holds.
    const destDir = path.join(platformRoot, target);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(source, path.join(destDir, "PrivacyInfo.xcprivacy"));

    const resources = project.hash.project.objects.PBXResourcesBuildPhase ?? {};
    const phaseRef = (nativeTarget.buildPhases ?? []).find(
      (p) => resources[p.value] && typeof resources[p.value] === "object",
    );
    const phase = phaseRef && resources[phaseRef.value];
    if (!phase) {
      throw new Error(
        `withWidgetPrivacyManifest: target "${target}" has no Resources build phase.`,
      );
    }

    const comment = "PrivacyInfo.xcprivacy in Resources";
    if (phase.files?.some((f) => f.comment === comment)) return cfg;

    const fileRefs = project.pbxFileReferenceSection();
    const buildFiles = project.pbxBuildFileSection();

    // The extension's group carries the target's name; the file reference has
    // to live in it so Xcode resolves "PrivacyInfo.xcprivacy" relative to the
    // extension folder rather than the project root.
    const groups = project.hash.project.objects.PBXGroup ?? {};
    const groupEntry = Object.entries(groups).find(
      ([uuid, value]) =>
        !uuid.endsWith("_comment") &&
        value &&
        typeof value === "object" &&
        [value.name, value.path].some((v) => String(v ?? "").replace(/"/g, "") === target),
    );

    const fileRefUuid = project.generateUuid();
    fileRefs[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "text.xml",
      path: "PrivacyInfo.xcprivacy",
      sourceTree: '"<group>"',
    };
    fileRefs[`${fileRefUuid}_comment`] = "PrivacyInfo.xcprivacy";

    if (groupEntry) {
      const [, group] = groupEntry;
      group.children = group.children ?? [];
      group.children.push({ value: fileRefUuid, comment: "PrivacyInfo.xcprivacy" });
    }

    const buildUuid = project.generateUuid();
    buildFiles[buildUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: "PrivacyInfo.xcprivacy",
    };
    buildFiles[`${buildUuid}_comment`] = comment;

    phase.files = phase.files ?? [];
    phase.files.push({ value: buildUuid, comment });

    return cfg;
  });

module.exports = withWidgetPrivacyManifest;
