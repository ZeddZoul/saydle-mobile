import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useFavorites } from "../../hooks/useFavorites.js";
import { ApiError, NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada" };

const affirmation = (id, text = "I am steady.") => ({
  id,
  text,
  categorySlug: "calm",
});

const favorite = (id) => ({
  favoritedAt: "2026-08-03T09:00:00Z",
  affirmation: affirmation(id),
});

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache(cachedFavorites = null) {
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => cachedFavorites),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const renderFavorites = ({ cache, client }) =>
  renderHook(() => useFavorites(), {
    wrapper: ({ children }) => (
      <AuthProvider store={makeStore()} cache={cache} client={client}>
        {children}
      </AuthProvider>
    ),
  });

const baseClient = (overrides = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  favorites: jest.fn(async () => ({ favorites: [] })),
  addFavorite: jest.fn(async () => null),
  removeFavorite: jest.fn(async () => null),
  ...overrides,
});

describe("useFavorites", () => {
  it("loads favorites from the network and caches them", async () => {
    const cache = makeCache();
    const client = baseClient({
      favorites: jest.fn(async () => ({ favorites: [favorite("a1")] })),
    });

    const { result } = await renderFavorites({ cache, client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);
    expect(cache.saveFavorites).toHaveBeenCalledWith("u1", [favorite("a1")]);
  });

  it("reports isFavorite for a loaded favorite", async () => {
    const client = baseClient({
      favorites: jest.fn(async () => ({ favorites: [favorite("a1")] })),
    });

    const { result } = await renderFavorites({ cache: makeCache(), client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFavorite("a1")).toBe(true);
    expect(result.current.isFavorite("nope")).toBe(false);
  });

  it("adds optimistically and calls the API", async () => {
    const client = baseClient();
    const { result } = await renderFavorites({ cache: makeCache(), client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(affirmation("a1"));
    });

    expect(client.addFavorite).toHaveBeenCalledWith("a1");
    expect(result.current.isFavorite("a1")).toBe(true);
  });

  it("removes optimistically and calls the API", async () => {
    const client = baseClient({
      favorites: jest.fn(async () => ({ favorites: [favorite("a1")] })),
    });
    const { result } = await renderFavorites({ cache: makeCache(), client });
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    await act(async () => {
      await result.current.toggle(affirmation("a1"));
    });

    expect(client.removeFavorite).toHaveBeenCalledWith("a1");
    expect(result.current.isFavorite("a1")).toBe(false);
  });

  it("keeps the optimistic state when the network is down", async () => {
    const client = baseClient({
      addFavorite: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });
    const cache = makeCache();
    const { result } = await renderFavorites({ cache, client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle(affirmation("a1"));
    });

    expect(result.current.isFavorite("a1")).toBe(true);
    expect(result.current.offline).toBe(true);
    // And it is queued, so the server finds out on the next flush.
    expect(cache.saveOutbox).toHaveBeenCalledWith("u1", [
      expect.objectContaining({
        kind: "favorite",
        payload: { affirmationId: "a1", favorite: true },
      }),
    ]);
  });

  it("rolls back when the server actively rejects the change", async () => {
    const client = baseClient({
      addFavorite: jest.fn(async () => {
        throw new ApiError(404, "not_found", "Affirmation not found.");
      }),
    });
    const { result } = await renderFavorites({ cache: makeCache(), client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.toggle(affirmation("a1"))).rejects.toBeInstanceOf(ApiError);
    });

    // A real rejection must not leave the UI claiming a favorite that isn't saved.
    expect(result.current.isFavorite("a1")).toBe(false);
  });

  it("serves cached favorites immediately when offline", async () => {
    const client = baseClient({
      favorites: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });

    const { result } = await renderFavorites({
      cache: makeCache([favorite("a1")]),
      client,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.offline).toBe(true);
  });
});
