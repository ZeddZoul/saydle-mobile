import * as Notifications from "expo-notifications";
import { requestPermission, syncReminders, cancelAll } from "../../lib/notifications.js";

const entry = (date, text) => ({ date, affirmation: { id: `a-${date}`, text } });
const NOW = new Date(2026, 7, 4, 9, 0, 0);

const entries = [
  entry("2026-08-04", "I can begin before I feel ready."),
  entry("2026-08-05", "I am allowed to rest."),
];

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});

describe("requestPermission", () => {
  it("does not re-prompt when permission is already granted", async () => {
    await expect(requestPermission()).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("prompts when permission has not been asked for yet", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ granted: true });

    await expect(requestPermission()).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it("does not re-prompt after an explicit refusal", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(requestPermission()).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("reports false rather than throwing when the module misbehaves", async () => {
    Notifications.getPermissionsAsync.mockRejectedValue(new Error("no notification manager"));
    await expect(requestPermission()).resolves.toBe(false);
  });
});

describe("syncReminders", () => {
  it("clears the old window before scheduling a new one", async () => {
    await syncReminders({ enabled: true, times: ["18:30"], entries, now: NOW });
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

  it("schedules the affirmation text at the chosen time", async () => {
    const count = await syncReminders({
      enabled: true,
      count: 1,
      start: "18:30",
      end: "22:00",
      entries,
      now: NOW,
    });

    expect(count).toBe(2); // one per cached day
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Saydle",
          body: "I can begin before I feel ready.",
        }),
        trigger: expect.objectContaining({ date: expect.any(Date) }),
      }),
    );
  });

  it("spreads the count evenly across the window", async () => {
    await syncReminders({
      enabled: true,
      count: 3,
      start: "09:00",
      end: "21:00",
      entries: [entry("2026-08-05", "I am allowed to rest.")],
      now: NOW,
    });

    // 3 across 09:00–21:00 → 09:00, 15:00, 21:00.
    const hours = Notifications.scheduleNotificationAsync.mock.calls.map(([arg]) =>
      arg.trigger.date.getHours(),
    );
    expect(hours).toEqual([9, 15, 21]);
  });

  it("cancels everything and schedules nothing when reminders are off", async () => {
    const count = await syncReminders({
      enabled: false,
      count: 1,
      start: "18:30",
      end: "22:00",
      entries,
      now: NOW,
    });

    expect(count).toBe(0);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules nothing without permission", async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });

    const count = await syncReminders({
      enabled: true,
      count: 1,
      start: "18:30",
      end: "22:00",
      entries,
      now: NOW,
    });

    expect(count).toBe(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("keeps going when one slot fails to schedule", async () => {
    Notifications.scheduleNotificationAsync
      .mockRejectedValueOnce(new Error("queue full"))
      .mockResolvedValue("ok");

    const count = await syncReminders({
      enabled: true,
      count: 1,
      start: "18:30",
      end: "22:00",
      entries,
      now: NOW,
    });

    expect(count).toBe(1); // the second one still landed
  });
});

describe("cancelAll", () => {
  it("swallows errors so teardown can't break the app", async () => {
    Notifications.cancelAllScheduledNotificationsAsync.mockRejectedValue(new Error("nope"));
    await expect(cancelAll()).resolves.toBeUndefined();
  });
});
