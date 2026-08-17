/**
 * Does the model actually choose seven lines *for this person*?
 *
 * "Pick the seven most profound" is a vague instruction, and there are three
 * cheap ways for it to look like it worked while doing nothing:
 *
 *   1. positional — it returns the first seven and we call that taste
 *   2. length — it returns the longest seven, which is a proxy for nothing
 *   3. impersonal — it returns the *same* seven whoever is asking, which means
 *      "tailored" is a story we tell rather than a thing that happens
 *
 * The third is the one that matters and the one a casual look would miss: a
 * selection can be thoughtful, consistent, defensible — and identical for
 * everybody. So the test is not "did it choose well", which needs a human, but
 * "did the choice move when the person did", which does not.
 *
 *   node server/scripts/evalPracticePicks.mjs
 */
import { GoogleGenAI } from "@google/genai";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
const MODEL = process.env.VERTEX_MODEL ?? "gemini-2.5-flash";

if (!PROJECT) {
  console.error("GOOGLE_CLOUD_PROJECT is not set — run with server/.env loaded.");
  process.exit(1);
}

/** One shared pool, so every difference in the picks comes from the reader. */
const POOL = [
  "I can begin again on a Tuesday.",
  "My worth is a given, not something I earn.",
  "I am allowed to take up space.",
  "Rest is not a reward for finishing.",
  "I can be enough before I am finished.",
  "I get to pause and regroup without explanation.",
  "I can choose to respond with kindness to myself.",
  "The pace I keep is mine to set.",
  "I do not have to earn my own kindness.",
  "I can hold a hard feeling without becoming it.",
  "What I did today counted, even quietly.",
  "I am allowed to change my mind out loud.",
  "My body is not a problem to be solved.",
  "I can ask for help before it is an emergency.",
  "Being tired is information, not a failing.",
  "I can be proud of something nobody saw.",
  "I do not owe anyone my constant improvement.",
  "Small and steady is still moving.",
  "I can leave a room that is not good for me.",
  "My attention is worth protecting.",
  "I can be new at something in front of people.",
  "The story I tell about today is mine to write.",
  "I can want more without resenting what I have.",
  "I am allowed to be a work in progress at forty.",
  "I can let something be good enough.",
  "My feelings are not an inconvenience.",
  "I can trust myself with a hard decision.",
  "I do not have to be understood to be right.",
  "I can put myself back together slowly.",
  "There is nothing wrong with needing quiet.",
  "I can hold hope without a guarantee.",
  "I am not behind. There is no schedule.",
  "I can say no and still be kind.",
  "What I survived is not who I am.",
  "I can be gentle with the part of me that is afraid.",
  "I can start before I feel ready.",
  "My progress does not need an audience.",
  "I can love people without carrying them.",
  "I can be soft and still be strong.",
  "Today asked something of me and I answered.",
];

/** Deliberately far apart, so an unmoved selection is unambiguous. */
const READERS = [
  {
    id: "new-parent",
    profile:
      "34, recently had a first baby, exhausted, feels they have lost themselves, " +
      "wants calm and permission to rest. Tone preference: gentle.",
  },
  {
    id: "burnt-out-founder",
    profile:
      "41, running a company, working constantly, ties self-worth to output, " +
      "struggles to stop. Tone preference: grounded.",
  },
  {
    id: "student-anxious",
    profile:
      "19, first year at university, anxious about not being good enough, " +
      "compares themselves to everyone. Tone preference: energetic.",
  },
];

const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

async function pickSeven(reader) {
  const numbered = POOL.map((t, i) => `${i}. ${t}`).join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are choosing seven affirmations for one person to sit with today,",
              "read aloud to them in a calm voice.",
              "",
              `The person: ${reader.profile}`,
              "",
              "From the numbered list, choose exactly 7 that will land hardest for",
              "THIS person specifically. Not the seven best sentences — the seven",
              "most likely to reach them, given what you know.",
              "",
              numbered,
              "",
              'Reply with only JSON: {"picks":[<7 indices>],"why":"<one short sentence>"}',
            ].join("\n"),
          },
        ],
      },
    ],
    config: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: "application/json" },
  });

  const raw = response.text ?? "";
  const parsed = JSON.parse(raw);
  return { picks: parsed.picks ?? [], why: parsed.why ?? "" };
}

const overlap = (a, b) => a.filter((x) => b.includes(x)).length;
const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;

const results = [];

for (const reader of READERS) {
  const { picks, why } = await pickSeven(reader);
  results.push({ reader, picks, why });

  console.log(`\n── ${reader.id} ─────────────────────────────`);
  console.log(`   count: ${picks.length}${picks.length === 7 ? "" : "  <-- NOT 7"}`);
  console.log(`   why:   ${why}`);
  for (const i of picks) console.log(`   ${String(i).padStart(2)}  ${POOL[i]}`);
}

console.log("\n═══ verdict ═══════════════════════════════");

// 1. Positional bias: seven picks from a pool of forty should not cluster low.
const positions = results.flatMap((r) => r.picks);
const avgIndex = mean(positions);
console.log(
  `position   mean index ${avgIndex.toFixed(1)} of 39 ` +
    `(19.5 = no bias; near 3 = it took the first seven)`,
);

// 2. Length proxy: are the picks simply the longest sentences?
const pickedLen = mean(positions.map((i) => POOL[i].length));
const poolLen = mean(POOL.map((t) => t.length));
console.log(
  `length     picked ${pickedLen.toFixed(1)} chars vs pool ${poolLen.toFixed(1)} ` +
    `(close = not sorting by length)`,
);

// 3. The one that matters.
let pairs = [];
for (let a = 0; a < results.length; a += 1) {
  for (let b = a + 1; b < results.length; b += 1) {
    const shared = overlap(results[a].picks, results[b].picks);
    pairs.push({ a: results[a].reader.id, b: results[b].reader.id, shared });
    console.log(`shared     ${results[a].reader.id} vs ${results[b].reader.id}: ${shared}/7`);
  }
}

const avgShared = mean(pairs.map((p) => p.shared));
console.log(
  `\ntailored?  average overlap ${avgShared.toFixed(1)}/7 — ` +
    (avgShared >= 6
      ? "NO. Near-identical picks: the profile is not moving the choice."
      : avgShared <= 4
        ? "YES. The choice moves with the reader."
        : "PARTLY. Some movement, a strong shared core."),
);
