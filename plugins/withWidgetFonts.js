const { withXcodeProject } = require("@expo/config-plugins");

/**
 * Adds font files to the widget extension's own Resources build phase.
 *
 * WHY THIS EXISTS
 *
 * `@bittingz/expo-native-fonts` writes UIAppFonts into the extension's
 * Info.plist correctly, but the fonts never reach the extension bundle. The
 * cause is upstream in @expo/config-plugins: `addResourceFileToGroup` takes a
 * `targetUuid`, uses it only to choose the *group*, then calls
 * `project.addToPbxResourcesBuildPhase(file)` with no target — which always
 * resolves to the app's resources phase.
 *
 * The result is an extension declaring two fonts it does not ship. SwiftUI's
 * `Font.custom` falls back to the system face without raising anything, so the
 * only symptom is a widget quietly rendering in the wrong typeface.
 *
 * WHY IT BUILDS THE ENTRY BY HAND
 *
 * The obvious fix — `project.addResourceFile(path, { target })` — does nothing
 * here: node-xcode bails out early when the path is already in the project, and
 * by this point the app target has already claimed it. What we actually want is
 * a *second* PBXBuildFile pointing at the same file reference, pushed into the
 * extension's phase. One file on disk, referenced by two targets.
 */
const withWidgetFonts = (config, { target, fonts = [] } = {}) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    const targets = project.pbxNativeTargetSection();
    const entry = Object.entries(targets).find(
      ([, value]) => value?.name === target || value?.name === `"${target}"`,
    );

    if (!entry) {
      throw new Error(
        `withWidgetFonts: no target named "${target}". This must run after the widget plugin has created it.`,
      );
    }

    const [, nativeTarget] = entry;

    // Matched by section membership, NOT by comment. The widget plugin creates
    // the extension's PBXResourcesBuildPhase but labels it "Embed Foundation
    // Extensions", so looking for a phase commented "Resources" finds nothing.
    // And pbxResourcesBuildPhaseObj(targetUuid) ignores the target entirely and
    // returns the app's phase, which already holds these fonts — so that path
    // skipped every file without a word. Intersecting the target's own phase
    // list with the resources section is the only unambiguous way in.
    const resources = project.hash.project.objects.PBXResourcesBuildPhase ?? {};
    const phaseRef = (nativeTarget.buildPhases ?? []).find(
      (p) => resources[p.value] && typeof resources[p.value] === "object",
    );
    const phase = phaseRef && resources[phaseRef.value];

    if (!phase) {
      throw new Error(`withWidgetFonts: target "${target}" has no Resources build phase.`);
    }

    const fileRefs = project.pbxFileReferenceSection();
    const buildFiles = project.pbxBuildFileSection();

    for (const font of fonts) {
      const refEntry = Object.entries(fileRefs).find(
        ([uuid, value]) =>
          !uuid.endsWith("_comment") &&
          value &&
          typeof value === "object" &&
          String(value.path ?? "")
            .replace(/"/g, "")
            .endsWith(font),
      );

      if (!refEntry) {
        throw new Error(
          `withWidgetFonts: no file reference for ${font}. Is it listed in the expo-native-fonts config?`,
        );
      }

      const [fileRefUuid] = refEntry;
      const comment = `${font} in Resources`;

      // Already attached (a re-run without --clean); nothing to do.
      if (phase.files.some((f) => f.comment === comment)) continue;

      const buildUuid = project.generateUuid();
      buildFiles[buildUuid] = {
        isa: "PBXBuildFile",
        fileRef: fileRefUuid,
        fileRef_comment: font,
      };
      buildFiles[`${buildUuid}_comment`] = comment;

      phase.files.push({ value: buildUuid, comment });
    }

    return cfg;
  });

module.exports = withWidgetFonts;
