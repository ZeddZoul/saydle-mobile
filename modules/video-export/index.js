import { requireNativeModule } from "expo-modules-core";

/**
 * The video-export boundary.
 *
 * Same shape as `lib/purchases.js`, `lib/notifications.js` and `lib/widget.js`,
 * for the same reason: this is a native module, so it does not exist in Expo Go
 * and does not exist in a build made before it was added. Both are ordinary
 * states, not errors — every function reports `{ available: false }` rather
 * than throwing, and the app keeps working without the feature.
 *
 * The lazy `requireNativeModule` in a try/catch is what makes that true: a
 * top-level import of a missing native module takes down every screen that
 * touches this file.
 */
let cached;

function load() {
  if (cached !== undefined) return cached;

  try {
    cached = requireNativeModule("VideoExport");
  } catch {
    cached = null;
  }

  return cached;
}

/** True only when the native side is actually in this binary. */
export function videoExportAvailable() {
  return Boolean(load());
}

/**
 * Renders stills plus an optional voice track into one mp4.
 *
 * @param {object}   options
 * @param {string[]} options.images   file paths, in reading order
 * @param {string}   [options.audio]  file path; omit for a silent video
 * @param {number}   [options.secondsPerImage]
 * @param {number}   [options.width]  output width; height follows 9:16
 * @returns {Promise<{available: boolean, uri?: string, error?: Error}>}
 */
export async function exportVideo({
  images,
  audio = null,
  secondsPerImage = 4,
  width = 1080,
} = {}) {
  const native = load();
  if (!native) return { available: false };

  if (!Array.isArray(images) || images.length === 0) {
    return { available: true, error: new Error("No frames to render.") };
  }

  try {
    // Paths cross the bridge bare — the native side opens them with
    // UIImage(contentsOfFile:), which wants a path and not a file:// URL.
    const uri = await native.export(
      images.map((p) => String(p).replace(/^file:\/\//, "")),
      audio ? String(audio).replace(/^file:\/\//, "") : null,
      secondsPerImage,
      width,
    );

    return { available: true, uri: `file://${uri}` };
  } catch (error) {
    return { available: true, error };
  }
}
