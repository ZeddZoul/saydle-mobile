import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useVoicePreference } from "../../hooks/useVoicePreference.js";
import { todayLocal } from "../../lib/dates.js";

/**
 * The rule this hook exists for: choosing a voice changes tomorrow, never
 * today. It is not a nicety — today's audio is rendered and cached per
 * (text, voice), so a change that took effect immediately would throw that
 * away and pay to render the same seven lines again.
 *
 * So the tests are about *time*, and every one of them pins a date rather than
 * trusting the clock.
 */
const USER = { id: "u1", firstName: "Ada", email: "ada@example.com", preferences: {} };

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = (saved = null) => {
  const store = new Map();
  if (saved) store.set("voicePreference", saved);

  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    loadJson: jest.fn(async (_userId, name) => store.get(name) ?? null),
    saveJson: jest.fn(async (_userId, name, value) => void store.set(name, value)),
    clear: jest.fn(async () => {}),
  };
};

// `renderHook` is async in RNTL v14 — spreading it without awaiting hands back
// a promise, and every `result.current` reads undefined.
const setup = async ({ cache = makeCache(), user = USER } = {}) => {
  const client = { me: jest.fn(async () => ({ user })) };

  const Wrapper = ({ children }) => (
    <AuthProvider store={makeStore()} cache={cache} client={client}>
      {children}
    </AuthProvider>
  );
  Wrapper.displayName = "AuthWrapper";

  return { cache, ...(await renderHook(() => useVoicePreference(), { wrapper: Wrapper })) };
};

const DAY = 24 * 60 * 60 * 1000;

describe("useVoicePreference", () => {
  afterEach(() => jest.useRealTimers());

  it("starts on the voice suggested by their onboarding tone", async () => {
    const user = { ...USER, preferences: { tone: "grounded" } };
    const { result } = await setup({ user, cache: makeCache() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe("father");
    expect(result.current.pending).toBeNull();
  });

  it("falls back when they never picked a tone", async () => {
    const { result } = await setup();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe("mother");
  });

  it("does not change today's voice when a new one is chosen", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = result.current.active;
    await act(async () => result.current.choose("grandmother"));

    // The whole point: today reads in the voice today's audio was made for.
    expect(result.current.active).toBe(before);
    expect(result.current.pending).toBe("grandmother");
  });

  it("persists the choice with the day it lands", async () => {
    const { result, cache } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("mentor"));

    const [, name, value] = cache.saveJson.mock.calls.at(-1);
    expect(name).toBe("voicePreference");
    expect(value.pending).toBe("mentor");
    expect(value.pendingFrom).toBe(todayLocal(new Date(Date.now() + DAY)));
  });

  it("takes effect once that day arrives", async () => {
    const saved = {
      active: "mother",
      pending: "father",
      // Yesterday: a choice made two days ago has already landed.
      pendingFrom: todayLocal(new Date(Date.now() - DAY)),
    };

    const { result } = await setup({ cache: makeCache(saved) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.active).toBe("father");
    // Nothing left waiting — it is simply the voice now.
    expect(result.current.pending).toBeNull();
  });

  it("lands on the day itself, not the day after", async () => {
    // An off-by-one here is a voice change that appears to have been ignored.
    const saved = { active: "mother", pending: "peer", pendingFrom: todayLocal() };

    const { result } = await setup({ cache: makeCache(saved) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.active).toBe("peer");
  });

  it("keeps a choice pending until its day", async () => {
    const saved = {
      active: "mother",
      pending: "grandmother",
      pendingFrom: todayLocal(new Date(Date.now() + DAY)),
    };

    const { result } = await setup({ cache: makeCache(saved) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.active).toBe("mother");
    expect(result.current.pending).toBe("grandmother");
  });

  it("lets a pending choice be changed again before it lands", async () => {
    const { result, cache } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("mentor"));
    await act(async () => result.current.choose("peer"));

    // Not two queued changes — the last word before midnight wins.
    expect(result.current.pending).toBe("peer");
    expect(result.current.active).toBe("mother");
    expect(cache.saveJson.mock.calls.at(-1)[2].pending).toBe("peer");
  });

  it("reports no pending change when they re-pick the current voice", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose(result.current.active));

    // "Motherly from tomorrow" under a voice already reading today is noise.
    expect(result.current.pending).toBeNull();
  });

  it("exposes the speech parameters the session actually reads with", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.voice.key).toBe(result.current.active);
    expect(typeof result.current.voice.speech.rate).toBe("number");
  });

  it("survives a cache that cannot read", async () => {
    const cache = makeCache();
    cache.loadJson = jest.fn(async () => {
      throw new Error("AsyncStorage unavailable");
    });

    const { result } = await setup({ cache });

    // A preference that fails to load must leave Practice usable, not blank.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe("mother");
  });

  it("does not hang on a cache without the JSON helpers", async () => {
    const cache = makeCache();
    delete cache.loadJson;
    delete cache.saveJson;

    const { result } = await setup({ cache });

    // Optional chaining short-circuits the whole chain, so a missing helper
    // would otherwise leave the hook loading forever.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe("mother");

    // And choosing still moves the UI, even with nowhere to write it.
    await act(async () => result.current.choose("peer"));
    expect(result.current.pending).toBe("peer");
  });
});
