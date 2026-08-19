import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The offline read cache.
 *
 * Feed and favorites are namespaced by user id so signing into a second account
 * on the same device cannot show the first account's affirmations. The cached
 * user is stored unscoped, because bootstrap needs it before it knows who is
 * signed in.
 */
const VERSION = "v1";
const userKey = (userId, name) => `saydle:${VERSION}:${userId}:${name}`;
const LAST_USER_KEY = `saydle:${VERSION}:lastUser`;

async function readJson(storage, key) {
  try {
    const raw = await storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // A corrupt or unreadable cache is a cache miss, never a crash.
    return null;
  }
}

async function writeJson(storage, key, value) {
  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache writes are best-effort — a full disk must not break the app.
  }
}

export function createCache(storage = AsyncStorage) {
  return {
    saveFeed: (userId, payload) =>
      writeJson(storage, userKey(userId, "feed"), {
        ...payload,
        cachedAt: new Date().toISOString(),
      }),

    loadFeed: (userId) => readJson(storage, userKey(userId, "feed")),

    saveFavorites: (userId, favorites) =>
      writeJson(storage, userKey(userId, "favorites"), { favorites }),

    async loadFavorites(userId) {
      const cached = await readJson(storage, userKey(userId, "favorites"));
      return cached?.favorites ?? null;
    },

    saveStreak: (userId, streak) => writeJson(storage, userKey(userId, "streak"), streak),

    loadStreak: (userId) => readJson(storage, userKey(userId, "streak")),

    /** `{ profile, completeness, suggestions }` — the whole GET /profile body. */
    saveProfile: (userId, payload) => writeJson(storage, userKey(userId, "profile"), payload),

    loadProfile: (userId) => readJson(storage, userKey(userId, "profile")),

    /**
     * Nudge cadence lives on the device, not the server: it is about this
     * phone's launches, and losing it on reinstall costs nothing worse than one
     * extra question.
     */
    saveNudgeState: (userId, state) => writeJson(storage, userKey(userId, "nudge"), state),

    loadNudgeState: (userId) => readJson(storage, userKey(userId, "nudge")),

    /**
     * Practice history. Local by design: how many times someone said a line to
     * themselves is between them and their phone, and syncing it would turn a
     * private ritual into a metric.
     */
    /**
     * Generic per-user JSON, for small preferences that have no schema of their
     * own yet. Namespaced like everything else, which is what `clear` sweeps on.
     */
    saveJson: (userId, name, value) => writeJson(storage, userKey(userId, name), value),

    async loadJson(userId, name) {
      return readJson(storage, userKey(userId, name));
    },

    savePractice: (userId, history) => writeJson(storage, userKey(userId, "practice"), history),

    async loadPractice(userId) {
      const history = await readJson(storage, userKey(userId, "practice"));
      return Array.isArray(history) ? history : null;
    },

    /**
     * Where each affirmation's voice note lives on this device.
     *
     * `{ [affirmationId]: { uri, recordedAt } }` — the URI only. The audio file
     * itself never leaves the phone and is never uploaded: hearing yourself say
     * a thing is the point, and a server copy of that would be a liability with
     * no upside.
     */
    saveVoiceNotes: (userId, notes) => writeJson(storage, userKey(userId, "voice"), notes),

    async loadVoiceNotes(userId) {
      const notes = await readJson(storage, userKey(userId, "voice"));
      return notes && typeof notes === "object" ? notes : {};
    },

    /**
     * Writes made offline, waiting to be replayed — see lib/outbox.js. Unlike
     * the read caches, losing this loses something the user actually did, so it
     * is written before the optimistic UI update, not after.
     */
    saveOutbox: (userId, queue) => writeJson(storage, userKey(userId, "outbox"), queue),

    async loadOutbox(userId) {
      const queue = await readJson(storage, userKey(userId, "outbox"));
      return Array.isArray(queue) ? queue : null;
    },

    /**
     * Lets the app render a signed-in shell offline, before /me can answer.
     *
     * An `id` is the price of admission, and the guard is here rather than at
     * the call sites on purpose. A caller that merges a patch into a `user`
     * which happens to still be null produces `{...null, preferences}` — an
     * object with preferences and no identity — and writing that replaces a
     * perfectly good cached account with one the app cannot name. It renders as
     * "Hello" with no name and "Is  right?" with no email, and it survives
     * restarts, so it looks like the server lost the profile. Refusing the
     * write is what keeps one careless spread from doing that.
     */
    saveUser(user) {
      if (!user?.id) return Promise.resolve();
      return writeJson(storage, LAST_USER_KEY, user);
    },

    /** Symmetrical: an identity-less record already on disk is a cache miss. */
    async loadUser() {
      const user = await readJson(storage, LAST_USER_KEY);
      return user?.id ? user : null;
    },

    /**
     * Everything this device holds for one account.
     *
     * Swept by prefix rather than by a hand-kept list of names. The list was a
     * standing leak: every new cached thing had to remember to add itself, and
     * two — voice notes and the generic JSON above — had already not. Signing
     * out is a promise that the next account sees none of this, and a promise
     * kept by remembering to update a list somewhere else is not kept.
     *
     * `getAllKeys` is AsyncStorage's, so the fixed list stays as the fallback
     * for a storage that lacks it.
     */
    async clear(userId) {
      const keys = [LAST_USER_KEY];

      if (userId) {
        const prefix = userKey(userId, "");
        let swept = null;

        try {
          swept = (await storage.getAllKeys?.())?.filter((k) => k.startsWith(prefix));
        } catch {
          // Fall through to the known names below.
        }

        keys.push(
          ...(swept ?? [
            userKey(userId, "feed"),
            userKey(userId, "favorites"),
            userKey(userId, "streak"),
            userKey(userId, "profile"),
            userKey(userId, "nudge"),
            userKey(userId, "outbox"),
            userKey(userId, "practice"),
            userKey(userId, "voice"),
          ]),
        );
      }

      try {
        await storage.multiRemove(keys);
      } catch {
        // Nothing useful to do; the next sign-in overwrites these anyway.
      }
    },
  };
}
