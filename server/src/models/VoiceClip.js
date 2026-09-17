import crypto from "node:crypto";
import mongoose from "mongoose";

/**
 * One rendered line, kept so it is never rendered twice.
 *
 * This collection is the cost model. Voice is 10-20x what generation costs and
 * the only line that scales with engagement, so the question that decides the
 * margin is not "how cheap is a render" but "how often do we render at all".
 * Every hit here is a render we do not pay for.
 *
 * Keyed on the text and the voice, never on the affirmation id. Two readers
 * given the same curated line in the same voice are one clip, which is most of
 * the benefit on the free bank; and a line that is edited is a different clip
 * rather than a stale one served under the old id.
 *
 * The exception is someone's own words. A "My words" line is private by
 * definition, so its clip is keyed on the owner as well and is served only to
 * them, under a signed URL — see controllers/voice.controller.js. Those rows
 * carry `user`; shared rows have `user: null`, and the purge removes the
 * former along with everything else that belongs to a person.
 *
 * The audio lives in the document. A short affirmation at 32kbps is ~20KB
 * against Mongo's 16MB ceiling, so there is a lot of headroom, and it buys
 * durability the filesystem cannot: on an ephemeral host every restart would
 * otherwise re-render the whole cache and bill us for it.
 */
const voiceClipSchema = new mongoose.Schema(
  {
    // sha256 of `${voiceId}:${text}` (plus the owner for a private clip) — the
    // cache key, and the only thing ever looked up. Hashed rather than stored
    // raw so the index stays a fixed width regardless of how long a line is.
    key: { type: String, required: true, unique: true, index: true },

    voiceId: { type: String, required: true },
    // Kept for debugging and for cache-wide invalidation if a voice is ever
    // withdrawn; never used to find a clip.
    text: { type: String, required: true },

    // Null for a shared clip. Set for a reader's own words, which nobody else
    // may play.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    // Whoever's session paid for the render. This is what the daily character
    // budget counts against: cache hits cost nothing and are not recorded.
    renderedFor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    audio: { type: Buffer, required: true },
    mimeType: { type: String, default: "audio/mpeg" },
    bytes: { type: Number, required: true },

    // What we were billed, so the cost per subscriber is measurable rather than
    // estimated. ElevenLabs bills per character.
    characters: { type: Number, required: true },

    // Touched on every hit. A clip nobody has played in months is the first
    // thing to evict if this collection ever needs bounding.
    lastUsedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// The budget query: "how much did this reader have rendered since yesterday".
voiceClipSchema.index({ renderedFor: 1, createdAt: -1 });

/**
 * The cache key. Stable across processes, which an in-memory map would not be.
 *
 * A shared clip's key is unchanged from before owners existed, so nothing
 * already rendered is orphaned. An owned clip folds the owner in, which is
 * what makes "the same sentence, written by two people" two clips rather than
 * one that either could play.
 */
export function clipKey(text, voiceId, ownerId = null) {
  const scope = ownerId ? `${voiceId}:${text}:owner:${String(ownerId)}` : `${voiceId}:${text}`;
  return crypto.createHash("sha256").update(scope).digest("hex");
}

export const VoiceClip =
  mongoose.models.VoiceClip ?? mongoose.model("VoiceClip", voiceClipSchema);
