import { getTheme } from "../../theme/themes.js";

const TODAY = "2026-08-05";
const entries = [
  { date: TODAY, affirmation: { id: "a1", text: "I am allowed to start small." } },
  { date: "2026-08-06", affirmation: { id: "a2", text: "I can begin before I feel ready." } },
];

const loadFresh = ({ module } = {}) => {
  jest.resetModules();

  if (module === undefined) {
    // Expo Go, or a build without the widget extension.
    jest.doMock("@bittingz/expo-widgets", () => {
      throw new Error("Cannot find native module");
    });
  } else {
    jest.doMock("@bittingz/expo-widgets", () => module);
  }

  return require("../../lib/widget.js");
};

afterEach(() => {
  jest.resetModules();
  jest.dontMock("@bittingz/expo-widgets");
});

describe("with no widget module", () => {
  it("reports unavailable rather than taking down the screen that calls it", () => {
    const widget = loadFresh();

    expect(widget.widgetsAvailable()).toBe(false);
    expect(widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY })).toEqual({
      available: false,
    });
  });
});

describe("with the widget module present", () => {
  const fake = () => ({ setWidgetData: jest.fn() });

  it("writes the snapshot as JSON the native side can parse", () => {
    const module = fake();
    const widget = loadFresh({ module });

    widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });

    expect(module.setWidgetData).toHaveBeenCalledTimes(1);
    const [json] = module.setWidgetData.mock.calls[0];
    const payload = JSON.parse(json);

    expect(payload.days[0].text).toBe("I am allowed to start small.");
    expect(payload.theme.accent).toBe(getTheme("dawn").accent);
  });

  it("addresses the App Group and key the iOS module reads", () => {
    const module = fake();
    const widget = loadFresh({ module });

    widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });

    // The `.expowidgets` suffix is fixed by the plugin; any other value writes
    // into a container the widget never reads, and nothing reports an error.
    const [, group, key] = module.setWidgetData.mock.calls[0];
    expect(group).toBe("group.com.saydle.app.expowidgets");
    expect(key).toBe("SaydleWidget");
  });

  it("does not rewrite an unchanged snapshot", () => {
    const module = fake();
    const widget = loadFresh({ module });

    widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });
    widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });

    // Every write wakes the widget's timeline.
    expect(module.setWidgetData).toHaveBeenCalledTimes(1);
  });

  it("writes again when the theme changes", () => {
    const module = fake();
    const widget = loadFresh({ module });

    widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });
    widget.syncWidget({ entries, theme: getTheme("midnight"), today: TODAY });

    expect(module.setWidgetData).toHaveBeenCalledTimes(2);
  });

  it("empties the snapshot on sign-out", () => {
    const module = fake();
    const widget = loadFresh({ module });

    widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });
    widget.clearWidget();

    // Someone's affirmations must not stay on the home screen of a phone they
    // just signed out of.
    const [json] = module.setWidgetData.mock.calls.at(-1);
    expect(JSON.parse(json).days).toEqual([]);
  });

  it("survives a native write that throws", () => {
    const module = {
      setWidgetData: jest.fn(() => {
        throw new Error("app group unavailable");
      }),
    };
    const widget = loadFresh({ module });

    // A stale widget is survivable; the app is not.
    const result = widget.syncWidget({ entries, theme: getTheme("dawn"), today: TODAY });
    expect(result.written).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});
