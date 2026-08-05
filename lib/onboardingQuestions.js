/**
 * The onboarding flow — a long, I-Am-style personalization funnel that IS the
 * signup. Credentials (email, password) are the last two steps; the account is
 * created only at the very end, on the paywall (see app/onboarding.jsx).
 *
 * No progress bar or step count is shown anywhere ("keep the mystery"), so the
 * flow's length lives only here. Adding, cutting, reordering, or gating a
 * question is an edit to this one array.
 *
 *   kind       "single" | "multi" | "text" | "info"
 *   inputType  (text only) "email" | "password" — keyboard + inline validation
 *   options    (single/multi) { value, label, icon? }  icon = Ionicons name
 *   skippable  shows Skip; sensitive questions are always skippable
 *   sensitive  soft-pedalled; crisis-adjacent answers route to gentle content
 *   showIf     (answers) => boolean — question is skipped when it returns false
 *
 * Keys match server/src/config/profileFields.js where a field exists there, so
 * the eventual submit mapping is one-to-one.
 */
/**
 * Lets the later profile nudges ask a question in exactly the words onboarding
 * used, rather than inventing a second phrasing for the same field.
 * Populated at the bottom of this file, once the list exists.
 */
export const questionFor = (key) => QUESTION_INDEX.get(key) ?? null;

export const ONBOARDING_QUESTIONS = [
  {
    key: "callName",
    kind: "text",
    title: "What should we call you?",
    subtitle: "Your name will appear in your affirmations.",
    placeholder: "Your name",
  },
  {
    key: "ageBand",
    kind: "single",
    title: "How old are you?",
    subtitle: "Your age helps us pitch your affirmations right.",
    sensitive: true,
    skippable: true,
    options: [
      { value: "13-17", label: "13 to 17" },
      { value: "18-24", label: "18 to 24" },
      { value: "25-34", label: "25 to 34" },
      { value: "35-44", label: "35 to 44" },
      { value: "45-54", label: "45 to 54" },
      { value: "55+", label: "55+" },
    ],
  },
  {
    key: "recentMood",
    kind: "single",
    title: "How have you been feeling lately?",
    subtitle: "However it's been is okay.",
    sensitive: true,
    skippable: true,
    options: [
      { value: "awesome", label: "Awesome" },
      { value: "good", label: "Good" },
      { value: "okay", label: "Okay" },
      { value: "low", label: "Low" },
      { value: "struggling", label: "Really struggling" },
    ],
  },
  {
    key: "feelingCauses",
    kind: "multi",
    title: "What's shaping how you feel?",
    subtitle: "Pick whatever's on your mind.",
    options: [
      { value: "family", label: "Family" },
      { value: "friends", label: "Friends" },
      { value: "work", label: "Work" },
      { value: "health", label: "Health" },
      { value: "love", label: "Love" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    key: "feelingCausesOther",
    kind: "text",
    title: "Care to share?",
    subtitle: "What else is shaping how you feel — in your words.",
    placeholder: "As much or as little as you like",
    skippable: true,
    showIf: (a) => Array.isArray(a.feelingCauses) && a.feelingCauses.includes("other"),
  },
  {
    key: "relationshipStatus",
    kind: "single",
    title: "What best describes your relationship life?",
    subtitle: "So affirmations fit where you are.",
    sensitive: true,
    skippable: true,
    options: [
      { value: "happy", label: "In a happy relationship" },
      { value: "complicated", label: "It's complicated" },
      { value: "happily-single", label: "Happily single" },
      { value: "open-to-connection", label: "Single and open to connection" },
      { value: "breakup", label: "Going through a breakup" },
      { value: "not-interested", label: "Not interested in this topic" },
    ],
  },
  {
    key: "employmentStatus",
    kind: "single",
    title: "What's your day mostly about?",
    subtitle: "Choose the closest one.",
    skippable: true,
    options: [
      { value: "studying", label: "Studying" },
      { value: "job-seeking", label: "Looking for a job" },
      { value: "working", label: "Working" },
      { value: "retired", label: "Retired" },
      { value: "stay-at-home-parent", label: "Stay-at-home parent" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    key: "employmentStatusOther",
    kind: "text",
    title: "Care to share?",
    subtitle: "What does your day mostly look like?",
    placeholder: "As much or as little as you like",
    skippable: true,
    showIf: (a) => a.employmentStatus === "other",
  },
  {
    key: "supportAreas",
    kind: "multi",
    title: "Where do you most want support?",
    subtitle: "Pick the parts of life on your mind.",
    options: [
      { value: "work", label: "Work" },
      { value: "relationships", label: "Relationships" },
      { value: "self-worth", label: "Self-worth" },
      { value: "health", label: "Health" },
      { value: "money", label: "Money" },
      { value: "parenting", label: "Parenting" },
      { value: "purpose", label: "Purpose" },
      { value: "studies", label: "Studies" },
    ],
  },
  {
    key: "values",
    kind: "multi",
    title: "What matters most to you these days?",
    subtitle: "Choose as many as feel true.",
    options: [
      { value: "family", label: "Family" },
      { value: "growth", label: "Growth" },
      { value: "peace", label: "Peace" },
      { value: "freedom", label: "Freedom" },
      { value: "security", label: "Security" },
      { value: "connection", label: "Connection" },
      { value: "achievement", label: "Achievement" },
      { value: "faith", label: "Faith" },
      { value: "health", label: "Health" },
      { value: "creativity", label: "Creativity" },
    ],
  },
  {
    key: "motivation",
    kind: "multi",
    title: "What brought you here?",
    subtitle: "You can pick more than one.",
    options: [
      { value: "quiet-anxiety", label: "Quiet my anxiety" },
      { value: "believe", label: "Believe in myself" },
      { value: "heal", label: "Heal from something" },
      { value: "reach-goal", label: "Reach a goal" },
      { value: "less-alone", label: "Feel less alone" },
      { value: "calm-routine", label: "Build a calmer routine" },
    ],
  },
  {
    key: "innerCritic",
    kind: "single",
    title: "When something goes wrong, what's the voice in your head like?",
    subtitle: "There's no wrong answer — this helps us meet you where you are.",
    options: [
      { value: "harsh", label: "Harsh and critical" },
      { value: "anxious", label: "Anxious and worried" },
      { value: "dismissive", label: "Dismissive of myself" },
      { value: "fair", label: "Fair but firm" },
      { value: "kind", label: "Already pretty kind" },
    ],
  },
  {
    key: "limitingBelief",
    kind: "text",
    title: "What's one belief about yourself you'd love to rewrite?",
    subtitle: "This is the one we'll gently work on with you.",
    placeholder: "I'd love to stop believing that…",
    skippable: true,
  },
  {
    key: "aspiration",
    kind: "text",
    title: "When you picture the person you're becoming, what's different?",
    subtitle: "A sentence or two is plenty.",
    placeholder: "I'm becoming someone who…",
    skippable: true,
  },
  {
    key: "religion",
    kind: "single",
    title: "Do faith or spirituality shape how you see life?",
    subtitle: "We'll tailor the language, never assume.",
    sensitive: true,
    skippable: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "spiritual", label: "Spiritual, not religious" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "beliefs",
    kind: "single",
    title: "Which of these is closest to your beliefs?",
    subtitle: "Only to shape the language — you can skip this.",
    sensitive: true,
    skippable: true,
    // Only asked when faith or spirituality is part of the picture.
    showIf: (a) => a.religion === "yes" || a.religion === "spiritual",
    options: [
      { value: "christianity", label: "Christianity" },
      { value: "judaism", label: "Judaism" },
      { value: "islam", label: "Islam" },
      { value: "hinduism", label: "Hinduism" },
      { value: "buddhism", label: "Buddhism" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    key: "beliefsOther",
    kind: "text",
    title: "Care to share?",
    subtitle: "However you'd describe your beliefs — only if you'd like.",
    placeholder: "As much or as little as you like",
    skippable: true,
    showIf: (a) => a.beliefs === "other",
  },
  {
    key: "zodiac",
    kind: "single",
    title: "What's your star sign?",
    subtitle: "A little extra colour for your affirmations.",
    skippable: true,
    options: [
      { value: "aries", label: "Aries" },
      { value: "taurus", label: "Taurus" },
      { value: "gemini", label: "Gemini" },
      { value: "cancer", label: "Cancer" },
      { value: "leo", label: "Leo" },
      { value: "virgo", label: "Virgo" },
      { value: "libra", label: "Libra" },
      { value: "scorpio", label: "Scorpio" },
      { value: "sagittarius", label: "Sagittarius" },
      { value: "capricorn", label: "Capricorn" },
      { value: "aquarius", label: "Aquarius" },
      { value: "pisces", label: "Pisces" },
    ],
  },
  {
    key: "info_what",
    kind: "info",
    title: "Affirmations are short lines you say to yourself",
    subtitle: "Read a few each day and, over time, the kinder voice starts to feel like your own.",
  },
  {
    key: "affirmationFamiliarity",
    kind: "single",
    title: "How familiar are you with affirmations?",
    subtitle: "We'll pitch your experience to match.",
    skippable: true,
    options: [
      { value: "new", label: "This is new for me" },
      { value: "occasional", label: "I've used them occasionally" },
      { value: "regular", label: "I use them regularly" },
    ],
  },
  {
    key: "tone",
    kind: "single",
    title: "How do you like to be spoken to?",
    subtitle: "This sets the voice of your affirmations.",
    options: [
      { value: "gentle", label: "Gently and softly" },
      { value: "grounded", label: "Warm and grounded" },
      { value: "energetic", label: "Direct and motivating" },
    ],
  },
  {
    key: "targetFeelings",
    kind: "multi",
    title: "What do you want to feel more of?",
    subtitle: "Choose the feelings you're reaching for.",
    options: [
      { value: "calm", label: "Calm" },
      { value: "confident", label: "Confident" },
      { value: "grateful", label: "Grateful" },
      { value: "hopeful", label: "Hopeful" },
      { value: "strong", label: "Strong" },
      { value: "worthy", label: "Worthy" },
      { value: "focused", label: "Focused" },
      { value: "at-peace", label: "At peace" },
    ],
  },
  {
    key: "mentalHealthPractices",
    kind: "multi",
    title: "What already supports your wellbeing?",
    subtitle: "So affirmations sit alongside, not instead of.",
    sensitive: true,
    options: [
      { value: "support", label: "Support from others" },
      { value: "exercise", label: "Exercise and nutrition" },
      { value: "therapy", label: "Therapy" },
      { value: "journaling", label: "Journaling" },
      { value: "nature", label: "Spending time in nature" },
      { value: "meditation", label: "Meditation" },
    ],
  },
  {
    key: "selfCareBarriers",
    kind: "multi",
    title: "What usually gets in the way of self-care?",
    subtitle: "Naming it helps us help you around it.",
    options: [
      { value: "lose-momentum", label: "I lose momentum or forget" },
      { value: "no-immediate-effect", label: "I don't see an immediate effect" },
      { value: "none", label: "Nothing — I do it every day" },
      { value: "havent-found", label: "I haven't found what works" },
      { value: "dont-know-start", label: "I don't know where to start" },
      { value: "overwhelmed", label: "I get overwhelmed and give up" },
    ],
  },
  {
    key: "habitHelpers",
    kind: "multi",
    title: "What would help make this a daily habit?",
    subtitle: "You can select more than one.",
    options: [
      { value: "reminders", label: "Getting regular reminders" },
      { value: "progress", label: "Tracking my progress" },
      { value: "widget", label: "A home-screen widget" },
      { value: "guided-practice", label: "A guided practice" },
      { value: "unsure", label: "I don't know yet" },
    ],
  },
  {
    key: "dailyGoalMinutes",
    kind: "single",
    title: "How much time will you give it?",
    subtitle: "You can change this later.",
    skippable: true,
    options: [
      { value: 1, label: "1 minute a day" },
      { value: 3, label: "3 minutes a day" },
      { value: 10, label: "10 minutes a day" },
    ],
  },
  {
    key: "benefits",
    kind: "benefits",
    title: "What a daily practice does",
    subtitle: "A few minutes, most days, is enough to shift how you speak to yourself.",
    cta: "Got it",
  },
  {
    key: "reminders",
    kind: "reminders",
    title: "Get a lift throughout the day",
    subtitle: "Your affirmation arrives quietly, even offline.",
    cta: "Allow and save",
    skippable: true,
  },
  {
    key: "theme",
    kind: "theme",
    title: "Pick a look to start with",
    subtitle: "You can change it any time.",
  },
  {
    key: "streakIntro",
    kind: "streak",
    title: "Build a habit that sticks",
    subtitle: "Read one a day and watch the streak grow.",
  },
  {
    key: "goal",
    kind: "text",
    title: "What's one thing you're working toward right now?",
    subtitle: "Big or small.",
    placeholder: "Right now I'm working toward…",
    skippable: true,
  },
  {
    key: "weighing",
    kind: "text",
    title: "Is anything weighing on you right now?",
    subtitle: "Share as much or as little as you like — or skip.",
    placeholder: "What's been on your mind…",
    sensitive: true,
    skippable: true,
  },

  // The account itself — the last two steps, right before the paywall.
  {
    key: "email",
    kind: "text",
    inputType: "email",
    title: "Where should we save all this?",
    subtitle: "Your email keeps your affirmations and progress safe.",
    placeholder: "you@example.com",
  },
  {
    key: "password",
    kind: "text",
    inputType: "password",
    title: "Create a password",
    subtitle: "At least 8 characters.",
    placeholder: "At least 8 characters",
  },
];

const QUESTION_INDEX = new Map(ONBOARDING_QUESTIONS.map((q) => [q.key, q]));
