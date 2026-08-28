import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useFeed } from "../../hooks/useFeed.js";
import { NetworkError } from "../../lib/errors.js";
import { todayLocal } from "../../lib/dates.js";

const USER = { id: "u1", firstName: "Ada" };
const TODAY = todayLocal();

const entry = (date, text, seenAt = null) => ({
  date,
  seenAt,
  affirmation: { id: `a-${date}`, text, categorySlug: "calm" },
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

function makeCache(feed = null) {
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => feed),
    saveFeed: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const renderFeed = ({ cache, client }) =>
  renderHook(() => useFeed(), {
    wrapper: ({ children }) => (
      <AuthProvider store={makeStore()} cache={cache} client={client}>
        {children}
      </AuthProvider>
    ),
  });

describe("useFeed", () => {
  it("loads from the network and caches the result", async () => {
    const cache = makeCache();
    const payload = {
      today: TODAY,
      timezone: "UTC",
      entries: [entry(TODAY, "I am steady today.")],
    };
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => payload),
      markSeen: jest.fn(async () => ({ ok: true })),
    };

    const { result } = await renderFeed({ cache, client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(1);
    expect(cache.saveFeed).toHaveBeenCalledWith("u1", payload);
  });

  it("picks today's entry using the device's own date", async () => {
    const cache = makeCache();
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => ({
        today: "1999-01-01", // deliberately wrong: the client must not trust it
        timezone: "UTC",
        entries: [entry("1999-01-01", "Stale server day."), entry(TODAY, "I am steady today.")],
      })),
      markSeen: jest.fn(async () => ({ ok: true })),
    };

    const { result } = await renderFeed({ cache, client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.todayEntry.affirmation.text).toBe("I am steady today.");
  });

  it("serves cached entries and flags offline when the network fails", async () => {
    const cached = {
      today: TODAY,
      entries: [entry(TODAY, "I rest without earning it.")],
    };
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
      markSeen: jest.fn(),
    };

    const { result } = await renderFeed({ cache: makeCache(cached), client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.todayEntry.affirmation.text).toBe("I rest without earning it.");
    // Offline with content is not an error state.
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error only when offline with nothing cached", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
      markSeen: jest.fn(),
    };

    const { result } = await renderFeed({ cache: makeCache(null), client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.error).toBeInstanceOf(NetworkError);
  });

  it("marks today seen optimistically", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => ({
        today: TODAY,
        entries: [entry(TODAY, "I am steady today.")],
      })),
      markSeen: jest.fn(async () => ({ ok: true })),
    };

    const { result } = await renderFeed({ cache: makeCache(), client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markSeen();
    });

    expect(client.markSeen).toHaveBeenCalledWith(TODAY);
    expect(result.current.todayEntry.seenAt).not.toBeNull();
  });

  it("does not re-send a day that is already seen", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => ({
        today: TODAY,
        entries: [entry(TODAY, "I am steady today.", "2026-08-03T09:00:00Z")],
      })),
      markSeen: jest.fn(async () => ({ ok: true })),
    };

    const { result } = await renderFeed({ cache: makeCache(), client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markSeen();
    });

    expect(client.markSeen).not.toHaveBeenCalled();
  });

  it("keeps the optimistic seen state when the network drops", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => ({
        today: TODAY,
        entries: [entry(TODAY, "I am steady today.")],
      })),
      markSeen: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    };

    const cache = makeCache();
    const { result } = await renderFeed({ cache, client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markSeen();
    });

    expect(result.current.todayEntry.seenAt).not.toBeNull();
    // Queued too, so a day read on a plane still counts toward the streak.
    expect(cache.saveOutbox).toHaveBeenCalledWith("u1", [
      expect.objectContaining({ kind: "seen", payload: { date: TODAY } }),
    ]);
  });

  it("returns no today entry when the feed has no row for today", async () => {
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      feed: jest.fn(async () => ({ today: TODAY, entries: [] })),
      markSeen: jest.fn(),
    };

    const { result } = await renderFeed({ cache: makeCache(), client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.todayEntry).toBeNull();
  });
});
