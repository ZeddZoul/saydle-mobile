import { completeness, nextSuggestions } from "../services/profile.service.js";
import { resetFutureFeed, ensureFeed } from "../services/affirmation.service.js";

const serialize = (user) => ({
  profile: user.profile?.toJSON ? user.profile.toJSON() : (user.profile ?? {}),
  completeness: completeness(user),
  suggestions: nextSuggestions(user),
});

// Changing these does not change what the affirmations say, so they don't force
// the feed to be rebuilt.
const NON_CONTENT = new Set(["acquisitionSource", "dailyGoalMinutes", "streakGoal"]);

export function getProfile(req, res) {
  res.json(serialize(req.user));
}

export async function updateProfile(req, res, next) {
  try {
    let contentChanged = false;

    for (const [key, value] of Object.entries(req.body)) {
      // null clears the field; anything else sets it.
      req.user.profile[key] = value === null ? undefined : value;
      if (!NON_CONTENT.has(key)) contentChanged = true;
    }

    req.user.markModified("profile");
    await req.user.save();

    // The days scheduled ahead were generated against the old profile. Rebuild
    // the unseen future so tomorrow reflects the new signals; today is untouched.
    if (contentChanged) {
      await resetFutureFeed(req.user);
      await ensureFeed(req.user);
    }

    res.json(serialize(req.user));
  } catch (err) {
    next(err);
  }
}
