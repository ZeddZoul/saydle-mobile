import { FAST_SETTLE, SLOW_SETTLE, pollUntil, signature } from "../../lib/settle.js";

/**
 * The ladders a purchase is waited on.
 *
 * These are not arbitrary: a real Test Store webhook was measured arriving 80
 * seconds after the sale. A ladder that quietly got shorter would be a purchase
 * flow that gives up before the money arrives, which to the person who paid is
 * indistinguishable from a payment that failed.
 */
describe("the settle ladders", () => {
  const total = (ladder) => ladder.reduce((sum, ms) => sum + ms, 0);

  it("reads once immediately, because the fast phase is one someone waits through", () => {
    expect(FAST_SETTLE[0]).toBe(0);
  });

  it("outlasts the measured eighty seconds rather than stopping short of it", () => {
    // The bar was 60s while the name said 80 and the ladders reached 63.8 — a
    // poll that gives up before the event it waits for typically arrives.
    expect(total(FAST_SETTLE) + total(SLOW_SETTLE)).toBeGreaterThan(80_000);
  });

  it("keeps the blocking phase short enough to wait through", () => {
    // Past about ten seconds a spinner stops reading as "working" and starts
    // reading as "stuck", which is when the slow phase takes over.
    expect(total(FAST_SETTLE)).toBeLessThanOrEqual(10_000);
  });

  it("backs off rather than hammering", () => {
    const gaps = SLOW_SETTLE.slice(1);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(6_000);
  });

  it("is bounded, because entitlement is corrected on the next foreground anyway", () => {
    expect(FAST_SETTLE.length).toBeLessThan(20);
    expect(SLOW_SETTLE.length).toBeLessThan(20);
  });
});

describe("signature", () => {
  it("moves when a purchase moves the fields a purchase moves", () => {
    const before = { status: "none", expiresAt: null, verified: false };
    const after = { status: "active", expiresAt: "2027-01-01", verified: true };

    expect(signature(before)).not.toBe(signature(after));
  });

  it("does not move for a renewal that changed nothing we read", () => {
    const a = { status: "active", expiresAt: "2027-01-01", verified: true };
    const b = {
      status: "active",
      expiresAt: "2027-01-01",
      verified: true,
      source: "app_store",
    };

    // Deliberately narrow: `entitled` is already true for someone renewing and
    // `verified` is already true for anyone whose account has ever seen a
    // webhook, so a wider signature returns on the first read and waits for
    // nothing.
    expect(signature(a)).toBe(signature(b));
  });

  it("survives a null, which is what a failed read returns", () => {
    expect(() => signature(null)).not.toThrow();
    expect(signature(null)).toBe(signature(undefined));
  });
});

describe("pollUntil", () => {
  it("returns the first answer the caller accepts", async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce({ entitled: false })
      .mockResolvedValueOnce({ entitled: true });

    const result = await pollUntil(read, (v) => v.entitled, [0, 0, 0]);

    expect(result).toEqual({ entitled: true });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops asking once it has an answer", async () => {
    const read = jest.fn().mockResolvedValue({ entitled: true });

    await pollUntil(read, (v) => v.entitled, [0, 0, 0, 0, 0]);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than waiting forever", async () => {
    const read = jest.fn().mockResolvedValue({ entitled: false });

    const result = await pollUntil(read, (v) => v.entitled, [0, 0, 0]);

    // Null, not a throw: a webhook that never comes is a delay, not an error,
    // and the next foreground corrects it.
    expect(result).toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("treats a failed read as a rung that did not answer", async () => {
    // Someone is waiting on a webhook. One refused request in the middle of
    // that says nothing about the next one, and giving up on it would strand a
    // paid account on the paywall over a dropped packet.
    const read = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ entitled: true });

    const result = await pollUntil(read, (v) => v.entitled, [0, 0, 0]);

    expect(result).toEqual({ entitled: true });
  });

  it("does not accept a read that came back empty", async () => {
    const read = jest.fn().mockResolvedValue(null);

    // Dereferenced the way every real caller does, so deleting the null guard
    // in pollUntil throws here rather than passing quietly. `() => true` was
    // green either way, which made this a test of nothing.
    const result = await pollUntil(read, (v) => v.entitled, [0, 0]);

    expect(result).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("waits between rungs", async () => {
    const read = jest.fn().mockResolvedValue({ entitled: false });
    const started = Date.now();

    await pollUntil(read, (v) => v.entitled, [0, 30, 30]);

    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

describe("stopping a poll", () => {
  const { pollUntil: poll } = require("../../lib/settle.js");

  it("stops asking once it is called off", async () => {
    // The slow ladder is nearly a minute long. Without this the poll outlived
    // the screen that started it, still asking the API on behalf of someone
    // who had navigated away.
    const read = jest.fn().mockResolvedValue({ entitled: false });
    const controller = new AbortController();

    const running = poll(read, (v) => v.entitled, [0, 30, 30, 30], {
      signal: controller.signal,
    });
    controller.abort();

    expect(await running).toBeNull();
    expect(read.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("cuts a long wait short rather than sitting it out", async () => {
    const read = jest.fn().mockResolvedValue({ entitled: false });
    const controller = new AbortController();
    const started = Date.now();

    const running = poll(read, (v) => v.entitled, [0, 60_000], {
      signal: controller.signal,
    });
    // Let the first rung land, then call it off mid-sleep.
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await running;

    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("refuses to start when it is already called off", async () => {
    const read = jest.fn();
    const controller = new AbortController();
    controller.abort();

    expect(await poll(read, () => true, [0, 0], { signal: controller.signal })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("still works with no signal at all", async () => {
    const read = jest.fn().mockResolvedValue({ entitled: true });

    expect(await poll(read, (v) => v.entitled, [0])).toEqual({ entitled: true });
  });
});
