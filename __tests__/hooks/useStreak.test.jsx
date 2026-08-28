import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useStreak } from "../../hooks/useStreak.js";
import { NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada" };

const STREAK = {
  today: "2026-08-04",
  current: 3,
  longest: 5,
  seenToday: true,
  week: [],
};

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache(cachedStreak = null) {
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadStreak: jest.fn(async () => cachedStreak),
    saveStreak: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const renderStreak = ({ cache, client }) =>
  renderHook(() => useStreak(), {
    wrapper: ({ children }) => (
      <AuthProvider store={makeStore()} cache={cache} client={client}>
        {children}
      </AuthProvider>
    ),
  });

describe("useStreak", () => {
  it("loads from the network and caches the result", async () => {
    const cache = makeCache();
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      streak: jest.fn(async () => STREAK),
    };

    const { result } = await renderStreak({ cache, client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.streak.current).toBe(3);
    expect(cache.saveStreak).toHaveBeenCalledWith("u1", STREAK);
  });

  it("shows the cached streak and flags offline when the network fails", async () => {
    const cached = { ...STREAK, current: 2 };
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      streak: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    };

    const { result } = await renderStreak({ cache: makeCache(cached), client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.streak.current).toBe(2);
  });

  it("settles with no streak when offline and nothing is cached", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      streak: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    };

    const { result } = await renderStreak({ cache: makeCache(null), client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.streak).toBeNull();
  });

  it("re-fetches on refresh, so a day just read fills in", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      streak: jest
        .fn()
        .mockResolvedValueOnce({ ...STREAK, current: 3 })
        .mockResolvedValueOnce({ ...STREAK, current: 4 }),
    };

    const { result } = await renderStreak({ cache: makeCache(), client });
    await waitFor(() => expect(result.current.streak?.current).toBe(3));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.streak.current).toBe(4);
  });
});
