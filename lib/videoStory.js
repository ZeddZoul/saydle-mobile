import { Share } from "react-native";
import { exportVideo, videoExportAvailable } from "../modules/video-export";

/**
 * A session, rendered as a video someone can post.
 *
 * The frames are the real share cards — the same component, the same theme, the
 * same wordmark as the still image — captured with view-shot and handed to the
 * encoder as files. The smoke test deliberately uses a bundled icon instead, so
 * that a failure there is unambiguously the encoder; here the point is the
 * opposite, that what gets exported is the actual product.
 *
 * Guarded like every other native boundary: view-shot, expo-sharing and the
 * export module are all absent in Expo Go, and each one missing is an ordinary
 * state that reports rather than throws.
 */
let viewShot;
let sharing;

function loadViewShot() {
  if (viewShot !== undefined) return viewShot;
  try {
    viewShot = require("react-native-view-shot");
  } catch {
    viewShot = null;
  }
  return viewShot;
}

function loadSharing() {
  if (sharing !== undefined) return sharing;
  try {
    sharing = require("expo-sharing");
  } catch {
    sharing = null;
  }
  return sharing;
}

/** True only when we can capture frames AND encode them on this build. */
export function videoShareAvailable() {
  return Boolean(loadViewShot()?.captureRef && videoExportAvailable());
}

/**
 * Captures each card to a file, in order.
 *
 * Sequential rather than `Promise.all` on purpose. Each capture allocates a
 * full-size bitmap, and seven story cards at 2x is enough to be noticed on an
 * older phone; doing them one at a time keeps one alive at a time. The order is
 * the reading order, and it has to be, because it becomes the frame order.
 */
export async function captureFrames(refs) {
  const shot = loadViewShot();
  if (!shot?.captureRef) return { available: false, frames: [] };

  const frames = [];

  for (const ref of refs) {
    if (!ref?.current) continue;

    const uri = await shot.captureRef(ref, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      // The encoder scales the frame up to 1080 wide regardless, so capturing
      // above 2x costs memory and buys nothing.
      pixelRatio: 2,
    });

    frames.push(uri);
  }

  return { available: true, frames };
}

/**
 * Captures the cards and encodes them into one mp4.
 *
 * `secondsPerLine` defaults to the listening session's own pacing — a line is
 * read, then held in silence — because a video that moves faster than the
 * session it came from misrepresents the thing.
 *
 * The cards must be rendered at the story ratio. The native side aspect-*fills*
 * the frame, so a square card in a 9:16 video is centre-cropped and loses its
 * edges; matching the ratio at capture time is what avoids that.
 */
export async function exportStory({
  refs,
  audio = null,
  secondsPerLine = 5,
  width = 1080,
} = {}) {
  const captured = await captureFrames(refs);

  if (!captured.available) return { available: false };
  if (captured.frames.length === 0) {
    return { available: true, error: new Error("No frames were captured.") };
  }

  return exportVideo({
    images: captured.frames,
    audio,
    secondsPerImage: secondsPerLine,
    width,
  });
}

/**
 * Hands a finished mp4 to whatever the OS offers.
 *
 * Falls back to the plain-text share when expo-sharing is missing — the same
 * degradation as the still card, and for the same reason: losing the artefact
 * should not lose the act of sharing.
 */
export async function shareVideo(uri, { text, dialogTitle } = {}) {
  const share = loadSharing();

  if (!share || !uri) {
    await Share.share({ message: text });
    return { available: false, shared: true, fallback: true };
  }

  try {
    if (!(await share.isAvailableAsync())) {
      await Share.share({ message: text, url: uri });
      return { available: true, shared: true, fallback: true };
    }

    await share.shareAsync(uri, {
      mimeType: "video/mp4",
      dialogTitle,
      UTI: "public.mpeg-4",
    });

    return { available: true, shared: true, uri };
  } catch (error) {
    await Share.share({ message: text }).catch(() => {});
    return { available: true, shared: false, error };
  }
}

/** Test seam — both handles are cached for the life of the process. */
export function resetVideoShareCache() {
  viewShot = undefined;
  sharing = undefined;
}
