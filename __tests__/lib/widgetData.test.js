import {
  MAX_TEXT,
  WIDGET_DAYS,
  buildWidgetPayload,
  widgetPayloadChanged,
} from "../../lib/widgetData.js";
import { getTheme } from "../../theme/themes.js";

const TODAY = "2026-08-05";

const entry = (date, text) => ({ date, affirmation: { id: `a-${date}`, text } });

const feed = [
  entry("2026-08-03", "Yesterday's line."),
  entry(TODAY, "I am allowed to start small."),
  entry("2026-08-06", "I can begin before I feel ready."),
  entry("2026-08-07", "I let today end unfinished."),
];

describe("buildWidgetPayload", () => {
  it("hands over today and the days ahead, in order", () => {
    const payload = buildWidgetPayload({ entries: feed, theme: getTheme("dawn"), today: TODAY });

    expect(payload.days.map((d) => d.date)).toEqual([TODAY, "2026-08-06", "2026-08-07"]);
  });

  it("drops days already past — a widget is a window on today, not an archive", () => {
    const payload = buildWidgetPayload({ entries: feed, theme: getTheme("dawn"), today: TODAY });

    expect(payload.days.map((d) => d.text)).not.toContain("Yesterday's line.");
  });

  it("sends a fortnight, so the widget survives the app never being opened", () => {
    const long = Array.from({ length: 40 }, (_, i) =>
      entry(`2026-09-${String(i + 1).padStart(2, "0")}`, `Day ${i}`),
    );

    const payload = buildWidgetPayload({
      entries: long,
      theme: getTheme("dawn"),
      today: "2026-09-01",
    });

    expect(payload.days).toHaveLength(WIDGET_DAYS);
  });

  it("resolves the theme's colours, because the widget cannot read our theme", () => {
    const midnight = getTheme("midnight");
    const payload = buildWidgetPayload({ entries: feed, theme: midnight, today: TODAY });

    expect(payload.theme).toMatchObject({
      slug: "midnight",
      gradientStart: midnight.gradient[0],
      gradientEnd: midnight.gradient[1],
      ink: midnight.ink,
      accent: midnight.accent,
      dark: true,
    });
  });

  it("shortens a long affirmation at a word boundary", () => {
    const long =
      "I am allowed to take up space in rooms that were not built with me in mind, and to stay there";
    const payload = buildWidgetPayload({
      entries: [entry(TODAY, long)],
      theme: getTheme("dawn"),
      today: TODAY,
    });

    const text = payload.days[0].text;
    expect(text.length).toBeLessThanOrEqual(MAX_TEXT);
    // "…take up spa…" reads worse than a shorter whole thought.
    expect(text).toMatch(/\S…$/);
    expect(text).not.toMatch(/\s…$/);
  });

  it("leaves a short affirmation exactly as written", () => {
    const payload = buildWidgetPayload({
      entries: [entry(TODAY, "I can rest.")],
      theme: getTheme("dawn"),
      today: TODAY,
    });

    expect(payload.days[0].text).toBe("I can rest.");
  });

  it("skips entries with no affirmation attached", () => {
    const payload = buildWidgetPayload({
      entries: [{ date: TODAY }, entry("2026-08-06", "Real one.")],
      theme: getTheme("dawn"),
      today: TODAY,
    });

    expect(payload.days).toHaveLength(1);
  });

  it("produces a usable payload with no feed and no theme at all", () => {
    const payload = buildWidgetPayload({ entries: [], theme: undefined, today: TODAY });

    expect(payload.days).toEqual([]);
    // Brand defaults, so a widget added before sign-in still looks like Saydle.
    expect(payload.theme.gradientStart).toBe("#FDEEEC");
  });

  it("carries a version, so an old widget can tell rather than mis-render", () => {
    expect(buildWidgetPayload({ entries: feed, theme: getTheme("dawn"), today: TODAY }).version)
      .toBe(1);
  });
});

describe("widgetPayloadChanged", () => {
  const payload = () =>
    buildWidgetPayload({ entries: feed, theme: getTheme("dawn"), today: TODAY });

  it("says yes when there was nothing before", () => {
    expect(widgetPayloadChanged(null, payload())).toBe(true);
  });

  it("says no for an identical snapshot", () => {
    // Each write wakes the widget's timeline; spending battery to render the
    // same thing is waste.
    expect(widgetPayloadChanged(payload(), payload())).toBe(false);
  });

  it("says yes when the theme changes", () => {
    const dark = buildWidgetPayload({ entries: feed, theme: getTheme("midnight"), today: TODAY });
    expect(widgetPayloadChanged(payload(), dark)).toBe(true);
  });

  it("says yes when the day rolls over", () => {
    const tomorrow = buildWidgetPayload({
      entries: feed,
      theme: getTheme("dawn"),
      today: "2026-08-06",
    });
    expect(widgetPayloadChanged(payload(), tomorrow)).toBe(true);
  });
});
