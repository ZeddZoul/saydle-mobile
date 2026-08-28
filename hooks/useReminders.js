import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { requestPermission, syncReminders } from "../lib/notifications.js";
import { DEFAULT_WINDOW } from "../lib/reminders.js";

export const DEFAULT_REMINDERS = {
  enabled: false,
  count: 3,
  start: DEFAULT_WINDOW.start,
  end: DEFAULT_WINDOW.end,
};

/**
 * Reminder settings, kept on the server so they survive a reinstall, but
 * *delivered* locally from the device (see lib/notifications.js).
 *
 * Stored as a window ("N times between start and end"); the device spreads it
 * into concrete times when scheduling. Any change re-schedules immediately, and
 * `resync` runs when the feed changes so notifications carry current text.
 */
export function useReminders() {
  const { user, cache, updatePreferences } = useAuth();
  const [saving, setSaving] = useState(false);

  // Read field by field rather than spreading: a user cached under an older
  // shape shouldn't be able to introduce keys the API doesn't know.
  const stored = user?.preferences?.reminders;
  // Memoised because every callback below depends on it: rebuilt each render,
  // this object made all of them new identities on every render too.
  const settings = useMemo(
    () => ({
      enabled: stored?.enabled ?? DEFAULT_REMINDERS.enabled,
      count: stored?.count ?? DEFAULT_REMINDERS.count,
      start: stored?.start ?? DEFAULT_REMINDERS.start,
      end: stored?.end ?? DEFAULT_REMINDERS.end,
    }),
    [stored?.enabled, stored?.count, stored?.start, stored?.end],
  );

  const scheduleFromCache = useCallback(
    async (next) => {
      const cached = user?.id ? await cache.loadFeed(user.id) : null;
      await syncReminders({ ...next, entries: cached?.entries ?? [] });
    },
    [cache, user?.id],
  );

  /** @returns {Promise<{ok: boolean, reason?: "denied"|"failed"}>} */
  const save = useCallback(
    async (next) => {
      // Ask the OS only when switching reminders ON — nobody should see a
      // permission sheet for nudging a slider.
      if (next.enabled && !settings.enabled) {
        const granted = await requestPermission();
        if (!granted) return { ok: false, reason: "denied" };
      }

      // Send exactly the four fields the API accepts, never a spread of whatever
      // happens to be in state. The endpoint is strict, and a user cached from
      // an older shape (when reminders stored `times[]`) would otherwise smuggle
      // a stale key into the payload and get rejected.
      const payload = {
        enabled: Boolean(next.enabled),
        count: Number(next.count),
        start: next.start,
        end: next.end,
      };

      setSaving(true);
      try {
        await updatePreferences({ reminders: payload });
        await scheduleFromCache(payload);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: "failed", error: err };
      } finally {
        setSaving(false);
      }
    },
    [settings.enabled, updatePreferences, scheduleFromCache],
  );

  const setEnabled = useCallback((enabled) => save({ ...settings, enabled }), [save, settings]);

  /** Update the window — count, start, end — keeping everything else. */
  const setWindow = useCallback((patch) => save({ ...settings, ...patch }), [save, settings]);

  /** Re-schedule against the latest cached feed, without touching settings. */
  const resync = useCallback(() => scheduleFromCache(settings), [scheduleFromCache, settings]);

  return { settings, saving, setEnabled, setWindow, resync };
}
