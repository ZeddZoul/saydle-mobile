import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useSaved } from "../../hooks/useSaved.js";
import { ApiError, NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const row = (id, text) => ({
  savedAt: "2026-09-01T09:00:00.000Z",
  affirmation: { id, text },
});

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = (saved = null) => {
  const store = new Map();
  if (saved) store.set("saved", saved);
  return {
    store,
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

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  saved: jest.fn(async () => ({ saved: [row("a1", "I can begin again.")] })),
  addSaved: jest.fn(async () => ({})),
  removeSaved: jest.fn(async () => ({})),
  ...over,
});

const setup = async ({ cache = makeCache(), client = makeClient() } = {}) => {
  const Wrapper = ({ children }) => (
    <AuthProvider store={makeStore()} cache={cache} client={client}>
      {children}
    </AuthProvider>
  );
  Wrapper.displayName = "AuthWrapper";
  // renderHook is async in RNTL v14 — spread unawaited and every
  // result.current reads undefined.
  return { cache, client, ...(await renderHook(() => useSaved(), { wrapper: Wrapper })) };
};

describe("useSaved", () => {
  it("paints from cache before the server answers", async () => {
    const cache = makeCache([row("a9", "Cached line.")]);
    let release;
    const client = makeClient({ saved: jest.fn(() => new Promise((r) => (release = r))) });

    const { result } = await setup({ cache, client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].affirmation.text).toBe("Cached line.");

    await act(async () => release({ saved: [row("a1", "Fresh line.")] }));
    await waitFor(() => expect(result.current.items[0].affirmation.text).toBe("Fresh line."));
  });

  it("answers isSaved from the loaded list", async () => {
    const { result } = await setup();

    await waitFor(() => expect(result.current.isSaved("a1")).toBe(true));
    expect(result.current.isSaved("a2")).toBe(false);
  });

  it("moves the row and the icon together, without waiting for the server", async () => {
    // The write never resolves — everything asserted below happened before the
    // server said anything, which is the definition of optimistic.
    const client = makeClient({ removeSaved: jest.fn(() => new Promise(() => {})) });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.toggle({ id: "a1", text: "I can begin again." });
    });

    // Updating only the icon's set left the shelf showing a bookmark the
    // reader had just removed.
    expect(result.current.isSaved("a1")).toBe(false);
    expect(result.current.items).toHaveLength(0);
  });

  it("rolls both back when the server refuses", async () => {
    const client = makeClient({
      removeSaved: jest.fn(async () => {
        throw new ApiError(500, "boom", "No.");
      }),
    });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () =>
      result.current.toggle({ id: "a1", text: "I can begin again." }).catch(() => {}),
    );

    expect(result.current.isSaved("a1")).toBe(true);
    expect(result.current.items).toHaveLength(1);
  });

  it("keeps the optimistic state on a network failure", async () => {
    const client = makeClient({
      removeSaved: jest.fn(async () => {
        throw new NetworkError("offline");
      }),
    });
    const { result } = await setup({ client });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => result.current.toggle({ id: "a1", text: "I can begin again." }));

    // The same rule the rest of the app follows: only a real refusal rolls back.
    expect(result.current.items).toHaveLength(0);
    expect(result.current.offline).toBe(true);
  });

  it("reports the premium gate as locked, not as an error", async () => {
    const client = makeClient({
      saved: jest.fn(async () => {
        throw new ApiError(403, "forbidden", "Premium.");
      }),
    });
    const { result } = await setup({ client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    expect(result.current.offline).toBe(false);
  });

  it("caches what the server confirms, for the next cold start", async () => {
    const { cache, result } = await setup();

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await waitFor(() => expect(cache.store.get("saved")).toHaveLength(1));
  });
});
