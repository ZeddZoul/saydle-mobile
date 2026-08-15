import { Platform } from "react-native";
import { applicationId } from "expo-application";
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

/**
 * Must match the App Group in app.json and SAYDLE_APP_GROUP in Module.swift.
 *
 * The `.expowidgets` suffix is fixed by @bittingz/expo-widgets, which derives
 * the group as `group.<bundleIdentifier>.expowidgets` and does not read it from
 * config. Any other name here writes into a container the widget never reads —
 * which fails silently, with a widget that simply never updates.
 */
const APP_GROUP = `group.${
  process.env.EXPO_PUBLIC_IOS_BUNDLE_ID ?? "com.saydle.app"
}.expowidgets`;

// iOS writes under this key inside the App Group; on Android the plugin's own
// module fixes both the file and the key, so it is unused there.
const WIDGET_NAME = "SaydleWidget";

/**
 * The two platforms take genuinely different arguments, because their native
 * halves are written by different people: ours on iOS (see widgets/ios/Module.swift)
 * and the plugin's on Android, which wants the package name to build its
 * SharedPreferences file.
 */
const writeArgs = (json) =>
  Platform.OS === "ios" ? [json, APP_GROUP, WIDGET_NAME] : [json, applicationId];

let cached;
let lastPayload = null;

function load() {
  if (cached !== undefined) return cached;

  try {
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
    module.setWidgetData(...writeArgs(JSON.stringify(payload)));
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
    module.setWidgetData(...writeArgs(JSON.stringify({ version: 1, days: [] })));
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
