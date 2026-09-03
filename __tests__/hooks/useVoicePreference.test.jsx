import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useVoicePreference } from "../../hooks/useVoicePreference.js";
import { todayLocal } from "../../lib/dates.js";
import { ApiError } from "../../lib/errors.js";

/**
 * Which voice reads, and when a change to it lands.
 *
 * The server owns this now, because the server is what pays to render — a
 * change that took effect today would discard seven already-rendered clips and
 * bill us to make them again. So these tests are mostly about the hook
 * *deferring* to that answer rather than inventing its own, and about staying
 * usable when it cannot reach it.
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
    loadJson: jest.fn(async (_id, name) => store.get(name) ?? null),
    saveJson: jest.fn(async (_id, name, value) => void store.set(name, value)),
    clear: jest.fn(async () => {}),
  };
};

// Derived from the clock, never written as a literal. A hardcoded date here
// passes right up until the day it names arrives and then fails — the worst
// kind of test, because it breaks in CI on a change that had nothing to do
// with it. This one did exactly that.
const TOMORROW = todayLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  voicePreference: jest.fn(async () => ({
    active: "mother",
    pending: null,
    pendingFrom: null,
  })),
  setVoicePreference: jest.fn(async (voice) => ({
    active: "mother",
    pending: voice === "mother" ? null : voice,
    pendingFrom: voice === "mother" ? null : TOMORROW,
  })),
  ...over,
});

const setup = async ({ cache = makeCache(), client = makeClient() } = {}) => {
  const Wrapper = ({ children }) => (
    <AuthProvider store={makeStore()} cache={cache} client={client}>
      {children}
    </AuthProvider>
  );
  Wrapper.displayName = "AuthWrapper";

  // renderHook is async in RNTL v14 — spreading it unawaited hands back a
  // promise and every result.current reads undefined.
  return {
    cache,
    client,
    ...(await renderHook(() => useVoicePreference(), { wrapper: Wrapper })),
  };
};

describe("useVoicePreference", () => {
  it("takes the voice the server says is reading today", async () => {
    const client = makeClient({
      voicePreference: jest.fn(async () => ({ active: "father", pending: null })),
    });
    const { result } = await setup({ client });

    await waitFor(() => expect(result.current.active).toBe("father"));
    expect(result.current.pending).toBeNull();
  });

  it("paints from cache before the server answers", async () => {
    const cache = makeCache({ active: "grandfather", pending: "", pendingFrom: "" });
    let release;
    const client = makeClient({
      voicePreference: jest.fn(() => new Promise((r) => (release = r))),
    });

    const { result } = await setup({ cache, client });

    // The picker shows the right voice immediately rather than after a round trip.
    await waitFor(() => expect(result.current.active).toBe("grandfather"));
    await act(async () => release({ active: "mother", pending: null }));
    await waitFor(() => expect(result.current.active).toBe("mother"));
  });

  it("does not change today's voice when a new one is chosen", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("grandfather"));

    // Today's clips are already rendered and paid for.
    expect(result.current.active).toBe("mother");
    expect(result.current.pending).toBe("grandfather");
  });

  it("asks the server rather than deciding locally", async () => {
    const { result, client } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("peer"));

    // The date a change lands is the server's to set, not the phone's.
    expect(client.setVoicePreference).toHaveBeenCalledWith("peer", expect.any(String));
  });

  it("keeps the current voice when the server refuses", async () => {
    const client = makeClient({
      setVoicePreference: jest.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("father"));

    // Not optimistic, deliberately: a picker claiming a voice the renderer
    // never heard of is worse than a tap that visibly did nothing.
    expect(result.current.active).toBe("mother");
    expect(result.current.pending).toBeNull();
  });

  it("reads a 403 as the paywall, not as a failure", async () => {
    const client = makeClient({
      setVoicePreference: jest.fn(async () => {
        throw new ApiError(403, "forbidden", "Choosing a voice is part of Saydle premium.");
      }),
    });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.locked).toBe(false);
    await act(async () => result.current.choose("father"));

    // The voice they had is the voice they keep — and the picker learns to
    // say "Premium" instead of shrugging at a tap that did nothing.
    expect(result.current.locked).toBe(true);
    expect(result.current.active).toBe("mother");
    expect(result.current.pending).toBeNull();
  });

  it("learns it is locked from the read too, before anyone taps", async () => {
    const client = makeClient({
      voicePreference: jest.fn(async () => {
        throw new ApiError(403, "forbidden", "premium");
      }),
    });
    const { result } = await setup({ client });

    await waitFor(() => expect(result.current.locked).toBe(true));
    // Still usable: the device voice, suggested from their tone.
    expect(result.current.active).toBe("mother");
  });

  it("does not mistake being offline for being locked", async () => {
    const client = makeClient({
      setVoicePreference: jest.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("father"));

    expect(result.current.locked).toBe(false);
  });

  it("reports no pending change when they re-pick the current voice", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.choose("mother"));

    // "Motherly from tomorrow" under a voice already reading today is noise.
    expect(result.current.pending).toBeNull();
  });

  it("ignores a second tap while the first is in flight", async () => {
    let release;
    const client = makeClient({
      setVoicePreference: jest.fn(() => new Promise((r) => (release = r))),
    });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.choose("father");
    });
    await act(async () => {
      result.current.choose("peer");
    });

    // Two writes racing would land whichever returned last, not whichever was
    // tapped last.
    expect(client.setVoicePreference).toHaveBeenCalledTimes(1);
    await act(async () => release({ active: "mother", pending: "father" }));
  });

  it("caches the server's answer for the next cold start", async () => {
    const { result, cache } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(cache.saveJson).toHaveBeenCalled());
    const [, name, value] = cache.saveJson.mock.calls.at(-1);
    expect(name).toBe("voicePreference");
    expect(value.active).toBe("mother");
  });

  it("falls back to a tone-suggested voice before anything is stored", async () => {
    const client = makeClient({ voicePreference: jest.fn(async () => null) });
    const { result } = await setup({ client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe("mother");
  });

  it("exposes the speech parameters the device fallback reads with", async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.voice.key).toBe(result.current.active);
    expect(typeof result.current.voice.speech.rate).toBe("number");
  });

  it("stays usable offline", async () => {
    const client = makeClient({
      voicePreference: jest.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { result } = await setup({ client });

    // Practice must open, with some voice, whatever the network is doing.
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
  });
});
