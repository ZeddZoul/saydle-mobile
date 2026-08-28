import { describe, it, expect } from "vitest";
import {
  todayInZone,
  addDays,
  dateRange,
  daysBetween,
  isValidTimezone,
} from "../src/utils/dates.js";

describe("todayInZone", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayInZone("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("gives different days either side of the date line at the right moment", () => {
    // August, so Auckland is UTC+12 and London is UTC+1: 13:00Z is 14:00 on the
    // 3rd in London and 01:00 on the 4th in Auckland.
    const instant = new Date("2026-08-03T13:00:00Z");

    expect(todayInZone("Europe/London", instant)).toBe("2026-08-03");
    expect(todayInZone("Pacific/Auckland", instant)).toBe("2026-08-04");
  });

  it("rolls over at local midnight, not UTC midnight", () => {
    // 23:30 in New York on the 3rd is 03:30 UTC on the 4th.
    const instant = new Date("2026-08-04T03:30:00Z");

    expect(todayInZone("America/New_York", instant)).toBe("2026-08-03");
    expect(todayInZone("UTC", instant)).toBe("2026-08-04");
  });

  it("falls back to UTC for an unusable timezone rather than throwing", () => {
    const instant = new Date("2026-08-03T11:00:00Z");
    expect(todayInZone("Middle/Earth", instant)).toBe("2026-08-03");
  });
});

describe("addDays", () => {
  it("advances within a month", () => {
    expect(addDays("2026-08-03", 4)).toBe("2026-08-07");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("goes backwards", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("does not drift across a DST transition", () => {
    // US clocks change on 2026-11-01; date-only arithmetic must not notice.
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });
});

describe("dateRange", () => {
  it("produces a contiguous run starting at the given day", () => {
    expect(dateRange("2026-08-03", 3)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-08-03", "2026-08-07")).toBe(4);
    expect(daysBetween("2026-08-07", "2026-08-03")).toBe(-4);
  });

  it("is unaffected by a DST transition in between", () => {
    expect(daysBetween("2026-10-30", "2026-11-03")).toBe(4);
  });
});

describe("isValidTimezone", () => {
  it("accepts real IANA zones and rejects nonsense", () => {
    expect(isValidTimezone("Africa/Lagos")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Middle/Earth")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});
