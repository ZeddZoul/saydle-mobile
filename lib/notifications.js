import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { buildReminderPlan, spreadTimes } from "./reminders.js";

/**
 * The expo-notifications boundary. Everything here is best-effort: reminders are
 * a nicety, and a permission quirk or a full notification queue must never break
 * the app. The schedulable logic itself lives in lib/reminders.js so it can be
 * tested without touching native code.
 */

const CHANNEL_ID = "saydle-reminders";

// Show reminders even while the app is foregrounded — the affirmation IS the
// message, so it's worth seeing either way.
//
// Guarded because this runs at import time: expo-notifications is only partly
// supported in Expo Go, and a throw here would take down every screen that
// imports this module rather than just disabling reminders.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      // Older SDK field, harmless to keep for compatibility.
      shouldShowAlert: true,
    }),
  });
} catch {
  /* reminders degrade to off; the rest of the app is unaffected */
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Daily affirmations",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: [0, 200],
    });
  } catch {
    /* channel setup is best-effort */
  }
}

/** @returns {Promise<boolean>} whether reminders may be shown. */
export async function requestPermission() {
  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    // iOS: don't re-prompt once the user has explicitly declined — the OS won't
    // show the sheet again anyway, and asking looks broken.
    if (existing.canAskAgain === false) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  } catch {
    return false;
  }
}

export async function hasPermission() {
  try {
    return Boolean((await Notifications.getPermissionsAsync()).granted);
  } catch {
    return false;
  }
}

export async function cancelAll() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* nothing scheduled, or notifications unavailable */
  }
}

/**
 * Replaces the scheduled reminders with a fresh window built from the cached
 * feed. Called on sign-in, on feed refresh, and whenever settings change.
 *
 * Cancel-then-reschedule rather than diffing: the window is small, the feed can
 * change underneath us, and an exact-duplicate reminder is the worst outcome.
 *
 * @returns {Promise<number>} how many were scheduled
 */
export async function syncReminders({ enabled, count, start, end, entries, now }) {
  await cancelAll();

  if (!enabled) return 0;
  if (!(await hasPermission())) return 0;

  // The window is the stored setting; concrete times are derived here.
  const times = spreadTimes(count, start, end);
  const plan = buildReminderPlan({ entries, times, now });
  let scheduled = 0;

  for (const item of plan) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Saydle",
          body: item.body,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.at,
        },
      });
      scheduled += 1;
    } catch {
      // One bad slot shouldn't lose the rest of the window.
    }
  }

  return scheduled;
}
