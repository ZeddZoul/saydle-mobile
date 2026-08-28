import { FeedEntry } from "../models/FeedEntry.js";
import { computeStreak, weekStrip } from "../services/streak.service.js";
import { todayInZone } from "../utils/dates.js";

export async function getStreak(req, res, next) {
  try {
    const today = todayInZone(req.user.timezone);

    const entries = await FeedEntry.find(
      { user: req.user._id, seenAt: { $ne: null } },
      { date: 1 },
    ).lean();

    const seenDates = entries.map((e) => e.date);

    res.json({
      today,
      ...computeStreak(seenDates, today),
      week: weekStrip(seenDates, today),
    });
  } catch (err) {
    next(err);
  }
}
