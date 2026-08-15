import { Share } from "react-native";

/**
 * Turning a card view into a shareable image.
 *
 * Same guarded-boundary pattern as purchases and widgets: both modules are
 * native, so neither exists in Expo Go. Every function reports rather than
 * throws, and the caller falls back to sharing plain text — which is what the
 * app did before this existed, so the failure mode is simply the old feature.
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

/** True when we can render a card to a file AND hand that file to another app. */
export function imageShareAvailable() {
  return Boolean(loadViewShot()?.captureRef && loadSharing());
}

/**
 * Renders the card and opens the OS share sheet with the image.
 *
 * `text` is the plain-text fallback, used when either native piece is missing.
 * Sharing the sentence is still worth doing — it is just not the branded object
 * the card exists to produce.
 */
export async function shareCard(ref, { text, dialogTitle } = {}) {
  const shot = loadViewShot();
  const share = loadSharing();

  if (!shot?.captureRef || !share || !ref?.current) {
    await Share.share({ message: text });
    return { available: false, shared: true, fallback: true };
  }

  try {
    const uri = await shot.captureRef(ref, {
      format: "png",
      // 1 is the view's own pixel size; 2 keeps it crisp on a retina timeline
      // without producing a file too large to send over a message.
      quality: 1,
      result: "tmpfile",
      pixelRatio: 2,
    });

    if (!(await share.isAvailableAsync())) {
      await Share.share({ message: text, url: uri });
      return { available: true, shared: true, fallback: true };
    }

    await share.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle,
      UTI: "public.png",
    });

    return { available: true, shared: true, uri };
  } catch (error) {
    // A capture that fails should not cost the user the share entirely.
    await Share.share({ message: text }).catch(() => {});
    return { available: true, shared: false, error };
  }
}

/** Test seam — both handles are cached for the life of the process. */
export function resetShareCache() {
  viewShot = undefined;
  sharing = undefined;
}
