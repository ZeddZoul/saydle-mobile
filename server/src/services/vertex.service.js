import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  PROMPT_VERSION,
  buildUserPrompt,
} from "../prompts/affirmation.prompt.js";

/**
 * Raised when Vertex cannot serve a request for any reason. Callers are expected
 * to fall back to the curated bank rather than propagate this to the client —
 * a model outage must never mean a user opens the app to nothing.
 */
export class AiUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AiUnavailableError";
    this.cause = cause;
  }
}

let client;

function getClient() {
  // Credentials come from Application Default Credentials — either
  // GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key file, or
  // the platform's attached identity. Nothing is passed in code.
  client ??= new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION,
  });
  return client;
}

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}));

// --- explicit context cache -------------------------------------------------
// Off by default (AI_EXPLICIT_CACHE). Gemini 2.5 applies implicit caching to a
// repeated prefix at no storage cost, whereas an explicit cache bills per
// token-hour whether or not it is hit — only worth it at steady volume.
let cached = null; // { name, expiresAt, promptVersion }

async function getCachedContentName() {
  if (!env.AI_EXPLICIT_CACHE) return undefined;

  const stillValid =
    cached &&
    cached.promptVersion === PROMPT_VERSION &&
    cached.expiresAt > Date.now() + 60_000;

  if (stillValid) return cached.name;

  try {
    const created = await getClient().caches.create({
      model: env.VERTEX_MODEL,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        ttl: `${env.AI_CACHE_TTL_SECONDS}s`,
        displayName: `saydle-affirmations-v${PROMPT_VERSION}`,
      },
    });

    cached = {
      name: created.name,
      expiresAt: Date.now() + env.AI_CACHE_TTL_SECONDS * 1000,
      promptVersion: PROMPT_VERSION,
    };
    logger.info({ cache: created.name }, "created vertex context cache");
    return cached.name;
  } catch (err) {
    // A cache we cannot build is a cost optimisation we lose, not an outage.
    // Fall through to sending the system prompt inline.
    logger.warn({ err }, "context cache creation failed — sending prompt inline");
    cached = null;
    return undefined;
  }
}

/**
 * Generate a batch of affirmations. Returns `[{ text, category }]`.
 *
 * Callers must handle AiUnavailableError. The result is NOT yet safe to store —
 * run it through the moderation service first.
 */
export async function generateAffirmations({
  count,
  categories,
  tone,
  displayName,
  focus,
  avoid,
  profile,
  gentle,
  language,
  // The predicate deciding which of the reader's own words may be sent. It has
  // to be threaded all the way through: dropping it here silently restores the
  // permissive default in buildUserPrompt, and a crisis disclosure would reach
  // the model.
  screenText,
}) {
  if (!env.AI_ENABLED) {
    throw new AiUnavailableError("AI_ENABLED is false");
  }

  const cacheName = await getCachedContentName();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

  try {
    const response = await getClient().models.generateContent({
      model: env.VERTEX_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildUserPrompt({
                count,
                categories,
                tone,
                displayName,
                focus,
                avoid,
                profile,
                gentle,
                language,
                screenText,
              }),
            },
          ],
        },
      ],
      config: {
        // When a cache is in play the system prompt lives inside it; sending
        // both would duplicate the tokens and defeat the point.
        ...(cacheName
          ? { cachedContent: cacheName }
          : { systemInstruction: SYSTEM_PROMPT }),
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        safetySettings: SAFETY_SETTINGS,
        temperature: 1.1,
        maxOutputTokens: 4096,
        abortSignal: controller.signal,
      },
    });

    const raw = response.text;
    if (!raw) {
      throw new AiUnavailableError("Vertex returned no text (likely blocked)");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new AiUnavailableError("Vertex returned unparseable JSON", err);
    }

    const items = Array.isArray(parsed?.affirmations) ? parsed.affirmations : [];
    if (items.length === 0) {
      throw new AiUnavailableError("Vertex returned an empty batch");
    }

    logger.info(
      {
        requested: count,
        returned: items.length,
        cached: Boolean(cacheName),
        usage: response.usageMetadata,
      },
      "generated affirmations",
    );

    return items
      .filter((i) => typeof i?.text === "string")
      .map((i) => ({
        text: i.text.trim(),
        category: typeof i.category === "string" ? i.category.trim() : null,
      }));
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    throw new AiUnavailableError("Vertex request failed", err);
  } finally {
    clearTimeout(timeout);
  }
}

// Exposed for tests and for a future admin "warm the cache" endpoint.
export function __resetCacheState() {
  cached = null;
  client = undefined;
}
