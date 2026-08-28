/**
 * The offline write queue (Tier 2).
 *
 * Tier 1 made reads work offline. This makes writes survive: a favorite tapped
 * on the underground, a day marked read on a plane, a profile answer given in a
 * lift are all held here and replayed the next time the server is reachable.
 *
 * Two properties make replay safe, and every operation kind must keep them:
 *
 *   Idempotent — replaying a queued op twice is indistinguishable from once.
 *     PUT/DELETE favorite and POST seen already are; a PATCH of whole fields is.
 *     Anything expressed as a delta ("increment") does not belong in here.
 *
 *   Collapsible — an op supersedes the earlier one for the same `key`, so
 *     favoriting and unfavoriting the same line eleven times offline costs one
 *     request, not eleven. Profile patches merge instead of replacing, so two
 *     answers to different questions both survive.
 *
 * The pure functions below are the whole policy. Persistence and the API calls
 * live in the storage-backed wrapper at the bottom.
 */
import { NetworkError } from "./errors.js";

/**
 * Beyond this the queue is almost certainly a bug or a very long trip; we drop
 * the oldest rather than let storage grow without bound.
 */
export const MAX_QUEUED = 200;

/**
 * Adds an op, superseding any earlier one with the same key.
 *
 * Position is preserved on collapse: a re-favorite doesn't jump the queue past
 * writes the user made after it.
 */
export function enqueue(queue, op) {
  const at = queue.findIndex((existing) => existing.key === op.key);

  let next;
  if (at === -1) {
    next = [...queue, op];
  } else {
    next = [...queue];
    next[at] = op.merge
      ? { ...next[at], payload: { ...next[at].payload, ...op.payload } }
      : { ...op, id: next[at].id };
  }

  return next.length > MAX_QUEUED ? next.slice(next.length - MAX_QUEUED) : next;
}

/**
 * Replays the queue in order against `perform`.
 *
 * Stops at the first unreachable-server failure and keeps everything from there
 * on, because the connection is gone and the rest would fail identically —
 * order matters and burning attempts does not help.
 *
 * A server that actively *refuses* an op is different: retrying forever would
 * wedge the queue behind a write that can never succeed, so it is dropped and
 * reported. The caller decides whether that needs a rollback.
 */
export async function drain(queue, perform) {
  const rejected = [];

  for (let i = 0; i < queue.length; i += 1) {
    const op = queue[i];

    try {
      await perform(op);
    } catch (err) {
      if (err instanceof NetworkError) {
        return { pending: queue.slice(i), rejected, offline: true };
      }
      rejected.push({ op, error: err });
    }
  }

  return { pending: [], rejected, offline: false };
}

/** Op builders — the only place op shapes are defined. */
export const ops = {
  favorite: (affirmationId, favorite) => ({
    id: `favorite:${affirmationId}`,
    key: `favorite:${affirmationId}`,
    kind: "favorite",
    payload: { affirmationId, favorite },
  }),

  seen: (date) => ({
    id: `seen:${date}`,
    key: `seen:${date}`,
    kind: "seen",
    payload: { date },
  }),

  // One merged patch for the whole profile: answering two questions offline
  // must not have the second overwrite the first.
  profile: (patch) => ({
    id: "profile",
    key: "profile",
    kind: "profile",
    merge: true,
    payload: patch,
  }),

  preferences: (patch) => ({
    id: "preferences",
    key: "preferences",
    kind: "preferences",
    merge: true,
    payload: patch,
  }),
};

/** Maps an op onto the API client call that performs it. */
export function performWith(client) {
  return (op) => {
    switch (op.kind) {
      case "favorite":
        return op.payload.favorite
          ? client.addFavorite(op.payload.affirmationId)
          : client.removeFavorite(op.payload.affirmationId);
      case "seen":
        return client.markSeen(op.payload.date);
      case "profile":
        return client.updateProfile(op.payload);
      case "preferences":
        return client.updatePreferences(op.payload);
      default:
        // An op kind this build doesn't know — almost certainly left by a newer
        // version. Dropping it is better than blocking the queue forever.
        return Promise.resolve();
    }
  };
}

/**
 * The storage-backed outbox: the pure policy above, plus persistence, plus a
 * single-flight guard so a flush triggered from three screens at once replays
 * each op once.
 */
export function createOutbox({ cache, client, onRejected }) {
  let flushing = null;

  const read = (userId) => cache.loadOutbox(userId).then((q) => q ?? []);

  return {
    async add(userId, op) {
      if (!userId) return;
      const queue = enqueue(await read(userId), op);
      await cache.saveOutbox(userId, queue);
    },

    async pending(userId) {
      return userId ? read(userId) : [];
    },

    /** Safe to call often — on mount, on foreground, after any success. */
    async flush(userId) {
      if (!userId) return { pending: [], rejected: [], offline: false };
      if (flushing) return flushing;

      flushing = (async () => {
        const queue = await read(userId);
        if (queue.length === 0) return { pending: [], rejected: [], offline: false };

        const result = await drain(queue, performWith(client));
        await cache.saveOutbox(userId, result.pending);

        if (result.rejected.length > 0) onRejected?.(result.rejected);
        return result;
      })();

      try {
        return await flushing;
      } finally {
        flushing = null;
      }
    },
  };
}
