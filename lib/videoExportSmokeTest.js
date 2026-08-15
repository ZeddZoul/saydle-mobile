import { Asset } from "expo-asset";
import { exportVideo, videoExportAvailable } from "../modules/video-export";

/**
 * Does stills-plus-audio actually produce a playable file on this device?
 *
 * Deliberately the smallest thing that can answer that. It uses a bundled image
 * rather than a captured card, so a failure is the encoder rather than
 * view-shot, and it runs silent first, so a failure is AVAssetWriter rather
 * than the muxing step. Two unknowns tested one at a time.
 *
 * The specific thing being checked is not "did the module load" — the Swift
 * compiles, we know that. It is whether the Simulator can encode H.264 at all,
 * which it historically cannot: hardware encoding is a device feature, and if
 * this throws `writerFailed` here that is the Simulator, not this code.
 *
 * Dev-only, called by hand. Never wired into a screen.
 */
export async function runVideoExportSmokeTest({ audio = null } = {}) {
  if (!videoExportAvailable()) {
    return { ok: false, stage: "load", reason: "native module not in this binary" };
  }

  let frame;
  try {
    const asset = Asset.fromModule(require("../assets/icon.png"));
    await asset.downloadAsync();
    frame = asset.localUri ?? asset.uri;
  } catch (error) {
    return { ok: false, stage: "asset", error };
  }

  // Two frames, one second each: long enough to be a real video, short enough
  // that a hang is obvious rather than just slow.
  const result = await exportVideo({
    images: [frame, frame],
    audio,
    secondsPerImage: 1,
    width: 540,
  });

  if (!result.available) {
    return { ok: false, stage: "available", reason: "module reported unavailable" };
  }

  if (result.error) {
    return { ok: false, stage: audio ? "mux" : "encode", error: result.error };
  }

  return { ok: true, stage: audio ? "mux" : "encode", uri: result.uri };
}
