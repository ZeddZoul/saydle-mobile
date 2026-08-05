import { todayLocal, deviceTimezone, formatFriendlyDate } from "../../lib/dates.js";

describe("todayLocal", () => {
  it("formats as YYYY-MM-DD, matching the server's feed keys", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the local calendar day, not the UTC one", () => {
    // 23:30 local on the 3rd is already the 4th in UTC. The feed key must follow
    // the device's clock so a cached feed rolls over at the right moment.
    const local = new Date(2026, 7, 3, 23, 30, 0);
    expect(todayLocal(local)).toBe("2026-08-03");
  });

  it("handles the first and last day of a year", () => {
    expect(todayLocal(new Date(2026, 0, 1, 12))).toBe("2026-01-01");
    expect(todayLocal(new Date(2026, 11, 31, 12))).toBe("2026-12-31");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayLocal(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("deviceTimezone", () => {
  it("returns something the server will accept as an IANA zone", () => {
    const zone = deviceTimezone();

    expect(typeof zone).toBe("string");
    expect(zone.length).toBeGreaterThan(0);
    expect(() =>
      new Intl.DateTimeFormat("en-CA", { timeZone: zone }),
    ).not.toThrow();
  });
});

describe("formatFriendlyDate", () => {
  it("renders a readable date without shifting the day", () => {
    const formatted = formatFriendlyDate("2026-08-03");

    expect(formatted).toContain("3");
    expect(formatted).toMatch(/August/i);
  });
});
