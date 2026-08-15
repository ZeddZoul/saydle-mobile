import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useLibrary } from "../../hooks/useLibrary.js";
import { ApiError, NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const lines = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `a${from + i}`, text: `Line ${from + i}` }));

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = () => ({
  loadUser: jest.fn(async () => USER),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => null),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  library: jest.fn(async () => ({
    affirmations: lines(40),
    cursor: 0,
    total: 240,
    remaining: 240,
    refilling: false,
  })),
  librarySeen: jest.fn(async () => ({ cursor: 0 })),
  ...over,
});

const wrapper = (client) => {
  const Wrapper = ({ children }) => (
    <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
      {children}
    </AuthProvider>
  );
  Wrapper.displayName = "AuthWrapper";
  return Wrapper;
};

const setup = async (client = makeClient()) => {
  const hook = await renderHook(() => useLibrary(), { wrapper: wrapper(client) });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, client };
};

beforeEach(() => jest.useRealTimers());

describe("useLibrary", () => {
  it("loads the first page", async () => {
    const { result } = await setup();

    expect(result.current.affirmations).toHaveLength(40);
    expect(result.current.remaining).toBe(240);
  });

  it("treats the paywall as a state, not an error", async () => {
    const client = makeClient({
      library: jest.fn(async () => {
        throw new ApiError(403, { message: "premium" });
      }),
    });

    const { result } = await setup(client);

    // The screen renders a locked card; nothing here should look like a crash.
    expect(result.current.locked).toBe(true);
    expect(result.current.affirmations).toEqual([]);
  });

  it("treats being offline as offline, not as locked", async () => {
    const client = makeClient({
      library: jest.fn(async () => {
        throw new NetworkError(new Error("down"));
      }),
    });

    const { result } = await setup(client);

    expect(result.current.offline).toBe(true);
    expect(result.current.locked).toBe(false);
  });

  it("appends the next page without duplicating the last one", async () => {
    const client = makeClient();
    client.library
      .mockResolvedValueOnce({
        affirmations: lines(40),
        cursor: 0,
        total: 240,
        remaining: 240,
        refilling: false,
      })
      // A page that overlaps, as a race at the list's end would produce.
      .mockResolvedValueOnce({
        affirmations: lines(40, 38),
        cursor: 0,
        total: 240,
        remaining: 240,
        refilling: false,
      });

    const { result } = await setup(client);
    await act(async () => result.current.loadMore());

    await waitFor(() => expect(result.current.affirmations.length).toBeGreaterThan(40));
    const ids = result.current.affirmations.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports progress once, not per line", async () => {
    jest.useFakeTimers();
    const client = makeClient();

    const { result } = await renderHook(() => useLibrary(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.markReached(0);
      result.current.markReached(1);
      result.current.markReached(2);
      jest.advanceTimersByTime(2000);
    });

    // Debounced: a fast scroll is one request, not forty.
    await waitFor(() => expect(client.librarySeen).toHaveBeenCalledTimes(1));
    expect(client.librarySeen).toHaveBeenCalledWith(3);
  });

  it("never reports a position behind one it already reported", async () => {
    jest.useFakeTimers();
    const client = makeClient();

    const { result } = await renderHook(() => useLibrary(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.markReached(9);
      jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(client.librarySeen).toHaveBeenCalledWith(10));

    await act(async () => {
      // Scrolling back up. Being shown a line again is not un-seeing it.
      result.current.markReached(2);
      jest.advanceTimersByTime(2000);
    });

    expect(client.librarySeen).toHaveBeenCalledTimes(1);
  });

  it("does not interrupt the reader when reporting fails", async () => {
    jest.useFakeTimers();
    const client = makeClient({
      librarySeen: jest.fn(async () => {
        throw new NetworkError(new Error("down"));
      }),
    });

    const { result } = await renderHook(() => useLibrary(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.markReached(4);
      jest.advanceTimersByTime(2000);
    });

    // Worst case is being shown a line twice — far cheaper than an error toast
    // in the middle of something someone is reading.
    expect(result.current.affirmations).toHaveLength(40);
  });
});
