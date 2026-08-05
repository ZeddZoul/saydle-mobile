import { Platform } from "react-native";
import { buildWidgetPayload, widgetPayloadChanged } from "./widgetData.js";

/**
 * The home-screen widget boundary.
 *
 * Same shape as lib/notifications.js and lib/purchases.js: a native module that
 * does not exist in Expo Go, required lazily and guarded, so a widget-less build
 * is a quiet non-event rather than a crash on the Today screen.
 *
 * The widget itself is native — WidgetKit on iOS, an AppWidgetProvider on
 * Android — and lives in `widgets/`. All this file does is hand it a JSON
 * snapshot through the shared container; everything about *what* to hand over
 * is in lib/widgetData.js, where it can be tested.
 */

// Must match the App Group in app.json and the suiteName in the Swift module.
const APP_GROUP = `group.${
  process.env.EXPO_PUBLIC_IOS_BUNDLE_ID ?? "com.anonymous.saydle-mobile"
}.widget`;

const WIDGET_NAME = "SaydleWidget";

let cached;
let lastPayload = null;

function load() {
  if (cached !== undefined) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@bittingz/expo-widgets");
  } catch {
    cached = null;
  }

  return cached;
}

export function widgetsAvailable() {
  return Boolean(load()?.setWidgetData);
}

/**
 * Pushes the next fortnight of affirmations to the widget.
 *
 * Safe to call on every feed change: it compares against what it last wrote and
 * does nothing when the snapshot is identical, because each write wakes the
 * widget's timeline and spending battery to render the same thing is waste.
 */
export function syncWidget({ entries, theme, today }) {
  const module = load();
  if (!module?.setWidgetData) return { available: false };

  const payload = buildWidgetPayload({ entries, theme, today });

  if (!widgetPayloadChanged(lastPayload, payload)) {
    return { available: true, written: false };
  }

  try {
    module.setWidgetData(
      JSON.stringify(payload),
      Platform.OS === "ios" ? APP_GROUP : undefined,
      WIDGET_NAME,
    );
    lastPayload = payload;
    return { available: true, written: true };
  } catch (error) {
    // A widget that fails to update is a stale widget, which is survivable. The
    // app is not.
    return { available: true, written: false, error };
  }
}

/** Clears the snapshot on sign-out — a widget must not outlive the session. */
export function clearWidget() {
  const module = load();
  if (!module?.setWidgetData) return { available: false };

  try {
    module.setWidgetData(
      JSON.stringify({ version: 1, days: [] }),
      Platform.OS === "ios" ? APP_GROUP : undefined,
      WIDGET_NAME,
    );
    lastPayload = null;
    return { available: true, written: true };
  } catch (error) {
    return { available: true, written: false, error };
  }
}

/** Test seam: the module caches both the native handle and the last payload. */
export function resetWidgetCache() {
  cached = undefined;
  lastPayload = null;
}
