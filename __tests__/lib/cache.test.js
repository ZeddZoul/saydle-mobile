import { createCache } from "../../lib/cache.js";

function makeStorage() {
  const data = new Map();
  return {
    data,
    getItem: jest.fn(async (key) => data.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      data.set(key, value);
    }),
    multiRemove: jest.fn(async (keys) => {
      keys.forEach((key) => data.delete(key));
    }),
  };
}

describe("createCache", () => {
  it("round-trips a feed", async () => {
    const cache = createCache(makeStorage());

    await cache.saveFeed("u1", { entries: [{ date: "2026-08-03" }] });
    const loaded = await cache.loadFeed("u1");

    expect(loaded.entries).toEqual([{ date: "2026-08-03" }]);
    expect(loaded.cachedAt).toEqual(expect.any(String));
  });

  it("namespaces by user so accounts cannot see each other's data", async () => {
    const cache = createCache(makeStorage());

    await cache.saveFeed("u1", { entries: [{ date: "2026-08-03" }] });

    expect(await cache.loadFeed("u2")).toBeNull();
  });

  it("returns null for a miss", async () => {
    const cache = createCache(makeStorage());

    expect(await cache.loadFeed("nobody")).toBeNull();
    expect(await cache.loadFavorites("nobody")).toBeNull();
  });

  it("treats corrupt JSON as a miss rather than throwing", async () => {
    const storage = makeStorage();
    storage.data.set("saydle:v1:u1:feed", "{not json");
    const cache = createCache(storage);

    await expect(cache.loadFeed("u1")).resolves.toBeNull();
  });

  it("swallows write failures so a full disk cannot crash the app", async () => {
    const storage = makeStorage();
    storage.setItem = jest.fn(async () => {
      throw new Error("QuotaExceeded");
    });
    const cache = createCache(storage);

    await expect(cache.saveFeed("u1", { entries: [] })).resolves.toBeUndefined();
  });

  it("round-trips favorites", async () => {
    const cache = createCache(makeStorage());

    await cache.saveFavorites("u1", [{ affirmation: { id: "a1" } }]);

    expect(await cache.loadFavorites("u1")).toEqual([{ affirmation: { id: "a1" } }]);
  });

  it("stores the last user unscoped, for offline bootstrap", async () => {
    const cache = createCache(makeStorage());

    await cache.saveUser({ id: "u1", firstName: "Ada" });

    expect(await cache.loadUser()).toEqual({ id: "u1", firstName: "Ada" });
  });

  it("refuses to store a user with no identity", async () => {
    const cache = createCache(makeStorage());
    await cache.saveUser({ id: "u1", firstName: "Ada", email: "ada@example.com" });

    // What a patch merged into a null user looks like. Letting this land wipes
    // the name and address off a perfectly good account, and it persists — the
    // app comes back saying "Hello" to nobody until /me can heal it.
    await cache.saveUser({ preferences: { theme: "dawn" } });

    expect(await cache.loadUser()).toEqual({
      id: "u1",
      firstName: "Ada",
      email: "ada@example.com",
    });
  });

  it("treats an identity-less record already on disk as a miss", async () => {
    const storage = makeStorage();
    await storage.setItem("saydle:v1:lastUser", JSON.stringify({ preferences: {} }));

    expect(await createCache(storage).loadUser()).toBeNull();
  });

  it("clears everything belonging to a user", async () => {
    const storage = makeStorage();
    const cache = createCache(storage);

    await cache.saveUser({ id: "u1" });
    await cache.saveFeed("u1", { entries: [] });
    await cache.saveFavorites("u1", []);
    await cache.saveProfile("u1", { completeness: { percent: 20 } });
    await cache.saveNudgeState("u1", { dismissals: 2 });
    await cache.saveOutbox("u1", [{ key: "seen:2026-08-05" }]);

    await cache.clear("u1");

    expect(await cache.loadUser()).toBeNull();
    expect(await cache.loadFeed("u1")).toBeNull();
    expect(await cache.loadFavorites("u1")).toBeNull();
    expect(await cache.loadProfile("u1")).toBeNull();
    expect(await cache.loadNudgeState("u1")).toBeNull();
    expect(await cache.loadOutbox("u1")).toBeNull();
  });

  it("round-trips the outbox queue", async () => {
    const cache = createCache(makeStorage());
    const queue = [{ key: "seen:2026-08-05", kind: "seen", payload: { date: "2026-08-05" } }];

    await cache.saveOutbox("u1", queue);

    expect(await cache.loadOutbox("u1")).toEqual(queue);
    expect(await cache.loadOutbox("u2")).toBeNull();
  });

  it("treats an outbox that isn't a list as empty", async () => {
    const storage = makeStorage();
    const cache = createCache(storage);

    // Written by an older build, or corrupted — must not crash the flush.
    await storage.setItem("saydle:v1:u1:outbox", JSON.stringify({ nope: true }));

    expect(await cache.loadOutbox("u1")).toBeNull();
  });

  it("scopes the profile and nudge cadence per user", async () => {
    const cache = createCache(makeStorage());

    await cache.saveProfile("u1", { completeness: { percent: 20 } });
    await cache.saveNudgeState("u1", { dismissals: 2 });

    expect((await cache.loadProfile("u1")).completeness.percent).toBe(20);
    expect(await cache.loadNudgeState("u1")).toEqual({ dismissals: 2 });

    // A second account on the same phone must not inherit the first's cadence.
    expect(await cache.loadProfile("u2")).toBeNull();
    expect(await cache.loadNudgeState("u2")).toBeNull();
  });
});
