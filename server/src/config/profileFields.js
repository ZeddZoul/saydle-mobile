/**
 * The single source of truth for the progressive profile — every optional signal
 * the onboarding funnel and the later "complete your profile" nudges can collect.
 *
 * Validation (validators/profile.schema.js), the Mongoose sub-schema (models/User),
 * completeness scoring, and nudge suggestions are all DERIVED from this list, so a
 * new question is added in exactly one place.
 *
 * Field shape:
 *   key        stored key
 *   kind       "single" | "multi" | "number" | "text"
 *   maxLength  (text only) cap; free text also gets crisis screening before
 *              it is ever sent to the model
 *   options    allowed values (slugs / numbers)
 *   label      human label, shown in nudges
 *   sensitive  GDPR special-category or otherwise sensitive — collected only with
 *              explicit intent, never volunteered in nudges before non-sensitive ones
 *   counts     whether it contributes to the completeness score (analytics-only
 *              fields like acquisitionSource do not); defaults true
 *   care       true if some options are crisis-adjacent and must route to gentle,
 *              curated content rather than model generation
 */
export const PROFILE_FIELDS = [
  {
    key: "ageBand",
    kind: "single",
    label: "Age range",
    sensitive: true, // includes 13–17: minor-data handling applies
    options: ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"],
  },
  {
    key: "recentMood",
    kind: "single",
    label: "How you've been feeling",
    sensitive: true,
    care: true,
    options: ["awesome", "good", "okay", "low", "struggling"],
  },
  {
    key: "feelingCauses",
    kind: "multi",
    label: "What's driving that",
    options: ["family", "friends", "work", "health", "love", "other"],
  },
  {
    key: "improveAreas",
    kind: "multi",
    label: "What you want to improve",
    options: [
      "personal-growth",
      "positive-thinking",
      "relationships",
      "happiness",
      "stress-anxiety",
      "being-thankful",
      "loving-myself",
      "loving-body",
    ],
  },
  {
    key: "relationshipStatus",
    kind: "single",
    label: "Relationship status",
    sensitive: true,
    care: true,
    options: [
      "happy",
      "complicated",
      "happily-single",
      "open-to-connection",
      "breakup",
      "not-interested",
    ],
  },
  {
    key: "employmentStatus",
    kind: "single",
    label: "What you're up to",
    options: [
      "studying",
      "job-seeking",
      "working",
      "retired",
      "stay-at-home-parent",
      "other",
    ],
  },
  {
    key: "religion",
    kind: "single",
    label: "Faith",
    sensitive: true,
    options: ["yes", "no", "spiritual"],
  },
  {
    key: "beliefs",
    kind: "single",
    label: "Belief tradition",
    sensitive: true,
    options: ["christianity", "judaism", "islam", "hinduism", "buddhism", "other"],
  },
  {
    key: "zodiac",
    kind: "single",
    label: "Zodiac sign",
    options: [
      "capricorn", "aquarius", "pisces", "aries", "taurus", "gemini",
      "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius",
    ],
  },
  {
    key: "affirmationFamiliarity",
    kind: "single",
    label: "Experience with affirmations",
    options: ["new", "occasional", "regular"],
  },
  {
    key: "practiceStyles",
    kind: "multi",
    label: "How you like to practice",
    options: ["journal", "postit", "aloud", "listen", "read", "unsure"],
  },
  {
    key: "mentalHealthPractices",
    kind: "multi",
    label: "What supports your wellbeing",
    sensitive: true,
    care: true,
    options: ["support", "exercise", "therapy", "journaling", "nature", "meditation"],
  },
  {
    key: "selfCareBarriers",
    kind: "multi",
    label: "What gets in the way",
    options: [
      "lose-momentum",
      "no-immediate-effect",
      "none",
      "havent-found",
      "dont-know-start",
      "overwhelmed",
    ],
  },
  {
    key: "letGoOf",
    kind: "multi",
    label: "What you're letting go of",
    sensitive: true,
    care: true,
    options: [
      "memories",
      "misplaced-hopes",
      "blame-anger",
      "failed-plans",
      "broken-relationships",
      "other",
    ],
  },
  {
    key: "lifeVision",
    kind: "single",
    label: "Your vision of the life you want",
    options: ["clear", "working-on-it", "one-day-at-a-time", "not-really"],
  },
  {
    key: "dailyGoalMinutes",
    kind: "number",
    label: "Daily time goal",
    options: [1, 3, 10],
  },
  {
    key: "streakGoal",
    kind: "number",
    label: "Streak goal",
    options: [3, 7, 21],
  },
  // --- Free text ------------------------------------------------------------
  // Stored individually rather than joined into one string, so the prompt can
  // say *what* each answer is ("their goal is…", "what's weighing on them is…")
  // instead of receiving an unlabelled blob. Every one of these is screened for
  // crisis language before it reaches the model — see FREE_TEXT_FIELDS.
  {
    key: "goal",
    kind: "text",
    label: "What you're working toward",
    maxLength: 300,
  },
  {
    key: "limitingBelief",
    kind: "text",
    label: "A belief you'd like to rewrite",
    maxLength: 300,
    sensitive: true,
    care: true,
  },
  {
    key: "aspiration",
    kind: "text",
    label: "Who you're becoming",
    maxLength: 300,
  },
  {
    key: "weighing",
    kind: "text",
    label: "What's weighing on you",
    maxLength: 300,
    sensitive: true,
    care: true,
  },
  {
    key: "feelingCausesOther",
    kind: "text",
    label: "What else is shaping how you feel",
    maxLength: 250,
    sensitive: true,
    care: true,
  },
  {
    key: "employmentStatusOther",
    kind: "text",
    label: "What your day looks like",
    maxLength: 250,
  },
  {
    key: "beliefsOther",
    kind: "text",
    label: "How you'd describe your beliefs",
    maxLength: 250,
    sensitive: true,
  },

  // --- Collected in the main onboarding flow -------------------------------
  {
    key: "supportAreas",
    kind: "multi",
    label: "Where you want support",
    options: ["work", "relationships", "self-worth", "health", "money", "parenting", "purpose", "studies"],
  },
  {
    key: "values",
    kind: "multi",
    label: "What matters to you",
    options: ["family", "growth", "peace", "freedom", "security", "connection", "achievement", "faith", "health", "creativity"],
  },
  {
    key: "motivation",
    kind: "multi",
    label: "Why you're here",
    options: ["quiet-anxiety", "believe", "heal", "reach-goal", "less-alone", "calm-routine"],
  },
  {
    key: "innerCritic",
    kind: "single",
    label: "Your inner voice when things go wrong",
    options: ["harsh", "anxious", "dismissive", "fair", "kind"],
  },
  {
    key: "targetFeelings",
    kind: "multi",
    label: "Feelings you want more of",
    options: ["calm", "confident", "grateful", "hopeful", "strong", "worthy", "focused", "at-peace"],
  },
  {
    key: "reminderTiming",
    kind: "multi",
    label: "When you need a lift",
    options: ["first-thing", "mid-morning", "midday", "evening", "before-bed"],
  },
  {
    key: "habitHelpers",
    kind: "multi",
    label: "What helps it stick",
    options: ["reminders", "progress", "widget", "guided-practice", "unsure"],
  },
  {
    key: "acquisitionSource",
    kind: "single",
    label: "How you found Saydle",
    counts: false, // analytics, not personalization
    options: [
      "tiktok",
      "instagram",
      "facebook",
      "play-store",
      "web-search",
      "friend-family",
      "other",
    ],
  },
];

export const FIELD_BY_KEY = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f]));

/** Free-text fields — these carry whatever the user typed, so they are screened. */
export const FREE_TEXT_FIELDS = PROFILE_FIELDS.filter((f) => f.kind === "text");

// Fields that move the completeness needle (everything except analytics-only).
export const COUNTED_FIELDS = PROFILE_FIELDS.filter((f) => f.counts !== false);

// Options that route a user to gentle, curated content instead of generation.
export const CARE_OPTIONS = {
  recentMood: ["low", "struggling"],
  relationshipStatus: ["breakup"],
  letGoOf: ["blame-anger", "broken-relationships"],
  mentalHealthPractices: ["therapy"],
};

/**
 * True when a profile holds a crisis-adjacent answer. Generation still happens
 * (a gentle, personalized affirmation is better than a generic one for someone
 * having a hard time), but with the `gentle` instruction — and acute *free-text*
 * still routes to the curated bank via moderation.focusNeedsCare.
 */
export function profileNeedsCare(profile = {}) {
  for (const [key, options] of Object.entries(CARE_OPTIONS)) {
    const value = profile?.[key];
    if (Array.isArray(value)) {
      if (value.some((v) => options.includes(v))) return true;
    } else if (options.includes(value)) {
      return true;
    }
  }
  return false;
}
