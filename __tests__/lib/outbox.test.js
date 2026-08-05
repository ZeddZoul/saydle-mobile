import {
  MAX_QUEUED,
  createOutbox,
  drain,
  enqueue,
  ops,
  performWith,
} from "../../lib/outbox.js";
import { ApiError, NetworkError } from "../../lib/errors.js";

const offline = () => {
  throw new NetworkError(new Error("offline"));
};

describe("enqueue", () => {
  it("appends distinct writes in the order they were made", () => {
    const queue = [ops.favorite("a1", true), ops.seen("2026-08-05")].reduce(enqueue, []);
    expect(queue.map((op) => op.key)).toEqual(["favorite:a1", "seen:2026-08-05"]);
  });

  it("collapses repeated toggles of the same line to the final state", () => {
    const queue = [
      ops.favorite("a1", true),
      ops.favorite("a1", false),
      ops.favorite("a1", true),
    ].reduce(enqueue, []);

    expect(queue).toHaveLength(1);
    expect(queue[0].payload.favorite).toBe(true);
  });

  it("keeps a collapsed write in its original place in the queue", () => {
    const queue = [
      ops.favorite("a1", true),
      ops.seen("2026-08-05"),
      ops.favorite("a1", false),
    ].reduce(enqueue, []);

    // The re-favorite must not jump ahead of the day marked read after it.
    expect(queue.map((op) => op.key)).toEqual(["favorite:a1", "seen:2026-08-05"]);
  });

  it("merges profile patches so a second answer doesn't erase the first", () => {
    const queue = [
      ops.profile({ values: ["growth"] }),
      ops.profile({ innerCritic: "harsh" }),
    ].reduce(enqueue, []);

    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual({ values: ["growth"], innerCritic: "harsh" });
  });

  it("lets a later answer overwrite an earlier one for the same field", () => {
    const queue = [
      ops.preferences({ tone: "gentle" }),
      ops.preferences({ tone: "grounded" }),
    ].reduce(enqueue, []);

    expect(queue[0].payload.tone).toBe("grounded");
  });

  it("drops the oldest rather than growing without bound", () => {
    let queue = [];
    for (let i = 0; i < MAX_QUEUED + 5; i += 1) queue = enqueue(queue, ops.favorite(`a${i}`, true));

    expect(queue).toHaveLength(MAX_QUEUED);
    expect(queue[0].key).toBe("favorite:a5");
  });
});

describe("drain", () => {
  it("empties the queue when everything succeeds", async () => {
    const perform = jest.fn(async () => {});
    const queue = [ops.favorite("a1", true), ops.seen("2026-08-05")];

    const result = await drain(queue, perform);

    expect(perform).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ pending: [], rejected: [], offline: false });
  });

  it("stops at the first unreachable server and keeps the rest in order", async () => {
    const perform = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(offline);

    const queue = [ops.favorite("a1", true), ops.seen("2026-08-05"), ops.profile({ x: 1 })];
    const result = await drain(queue, perform);

    // No point burning attempts on writes that would fail identically.
    expect(perform).toHaveBeenCalledTimes(2);
    expect(result.offline).toBe(true);
    expect(result.pending.map((op) => op.key)).toEqual(["seen:2026-08-05", "profile"]);
  });

  it("drops a write the server refuses instead of wedging the queue behind it", async () => {
    const perform = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new ApiError(404, "not_found", "No such affirmation.");
      })
      .mockResolvedValueOnce(undefined);

    const queue = [ops.favorite("gone", true), ops.seen("2026-08-05")];
    const result = await drain(queue, perform);

    expect(result.pending).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].op.key).toBe("favorite:gone");
    // The write behind it still went through.
    expect(perform).toHaveBeenCalledTimes(2);
  });
});

describe("performWith", () => {
  const client = {
    addFavorite: jest.fn(async () => {}),
    removeFavorite: jest.fn(async () => {}),
    markSeen: jest.fn(async () => {}),
    updateProfile: jest.fn(async () => {}),
    updatePreferences: jest.fn(async () => {}),
  };
  const perform = performWith(client);

  it("maps each op onto its endpoint", async () => {
    await perform(ops.favorite("a1", true));
    await perform(ops.favorite("a2", false));
    await perform(ops.seen("2026-08-05"));
    await perform(ops.profile({ values: ["growth"] }));
    await perform(ops.preferences({ tone: "gentle" }));

    expect(client.addFavorite).toHaveBeenCalledWith("a1");
    expect(client.removeFavorite).toHaveBeenCalledWith("a2");
    expect(client.markSeen).toHaveBeenCalledWith("2026-08-05");
    expect(client.updateProfile).toHaveBeenCalledWith({ values: ["growth"] });
    expect(client.updatePreferences).toHaveBeenCalledWith({ tone: "gentle" });
  });

  it("discards an op kind it doesn't recognise rather than blocking forever", async () => {
    // Left behind by a newer build after a downgrade.
    await expect(perform({ kind: "telepathy", payload: {} })).resolves.toBeUndefined();
  });
});

describe("createOutbox", () => {
  function makeCache(initial = []) {
    let queue = initial;
    return {
      loadOutbox: jest.fn(async () => queue),
      saveOutbox: jest.fn(async (_userId, next) => {
        queue = next;
      }),
      get current() {
        return queue;
      },
    };
  }

  it("persists a queued write before it is ever replayed", async () => {
    const cache = makeCache();
    const outbox = createOutbox({ cache, client: {} });

    await outbox.add("u1", ops.seen("2026-08-05"));

    expect(cache.saveOutbox).toHaveBeenCalledWith("u1", [
      expect.objectContaining({ key: "seen:2026-08-05" }),
    ]);
  });

  it("replays the queue and clears what succeeded", async () => {
    const cache = makeCache();
    const client = { markSeen: jest.fn(async () => {}), addFavorite: jest.fn(async () => {}) };
    const outbox = createOutbox({ cache, client });

    await outbox.add("u1", ops.seen("2026-08-05"));
    await outbox.add("u1", ops.favorite("a1", true));

    const result = await outbox.flush("u1");

    expect(result.pending).toEqual([]);
    expect(cache.current).toEqual([]);
    expect(client.markSeen).toHaveBeenCalledWith("2026-08-05");
  });

  it("keeps the queue intact when the server is still unreachable", async () => {
    const cache = makeCache();
    const outbox = createOutbox({ cache, client: { markSeen: offline } });

    await outbox.add("u1", ops.seen("2026-08-05"));
    const result = await outbox.flush("u1");

    expect(result.offline).toBe(true);
    expect(cache.current).toHaveLength(1);
  });

  it("replays each write once when several screens flush at the same time", async () => {
    const cache = makeCache();
    const markSeen = jest.fn(
      () => new Promise((resolve) => setTimeout(resolve, 5)),
    );
    const outbox = createOutbox({ cache, client: { markSeen } });

    await outbox.add("u1", ops.seen("2026-08-05"));
    await Promise.all([outbox.flush("u1"), outbox.flush("u1"), outbox.flush("u1")]);

    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it("reports writes the server refused, so the caller can put things right", async () => {
    const onRejected = jest.fn();
    const cache = makeCache();
    const client = {
      addFavorite: jest.fn(async () => {
        throw new ApiError(404, "not_found", "Gone.");
      }),
    };
    const outbox = createOutbox({ cache, client, onRejected });

    await outbox.add("u1", ops.favorite("gone", true));
    await outbox.flush("u1");

    expect(onRejected).toHaveBeenCalledWith([
      expect.objectContaining({ op: expect.objectContaining({ key: "favorite:gone" }) }),
    ]);
    expect(cache.current).toEqual([]);
  });

  it("does nothing at all with no signed-in user", async () => {
    const cache = makeCache();
    const outbox = createOutbox({ cache, client: {} });

    await outbox.add(undefined, ops.seen("2026-08-05"));
    const result = await outbox.flush(undefined);

    expect(cache.saveOutbox).not.toHaveBeenCalled();
    expect(result.pending).toEqual([]);
  });
});
