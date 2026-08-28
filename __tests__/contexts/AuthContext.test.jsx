import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../../contexts/AuthContext.jsx";
import { ApiError, NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

function makeStore({ hasSession = false } = {}) {
  let session = hasSession ? { accessToken: "a1", refreshToken: "r1" } : null;
  return {
    hasSession: jest.fn(async () => Boolean(session)),
    getAccessToken: jest.fn(async () => session?.accessToken ?? null),
    getRefreshToken: jest.fn(async () => session?.refreshToken ?? null),
    setSession: jest.fn(async (payload) => {
      session = payload;
    }),
    clear: jest.fn(async () => {
      session = null;
    }),
  };
}

function makeCache({ user = null } = {}) {
  return {
    loadUser: jest.fn(async () => user),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

// RNTL 14's renderHook is async, so this returns a promise callers must await.
const renderAuth = ({ store, cache, client, outbox }) =>
  renderHook(() => useAuth(), {
    wrapper: ({ children }) => (
      <AuthProvider store={store} cache={cache} client={client} outbox={outbox}>
        {children}
      </AuthProvider>
    ),
  });

describe("bootstrap", () => {
  it("settles to signed out when there is no stored session", async () => {
    const { result } = await renderAuth({
      store: makeStore(),
      cache: makeCache(),
      client: { me: jest.fn() },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(false);
  });

  it("confirms the session with the server and keeps the fresh user", async () => {
    const cache = makeCache();
    const { result } = await renderAuth({
      store: makeStore({ hasSession: true }),
      cache,
      client: { me: jest.fn(async () => ({ user: USER })) },
    });

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    expect(result.current.user).toEqual(USER);
    expect(cache.saveUser).toHaveBeenCalledWith(USER);
  });

  it("stays signed in offline when a cached user is available", async () => {
    // The core offline requirement: launching with no network keeps you in.
    const { result } = await renderAuth({
      store: makeStore({ hasSession: true }),
      cache: makeCache({ user: USER }),
      client: {
        me: jest.fn(async () => {
          throw new NetworkError(new Error("offline"));
        }),
      },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.offline).toBe(true);
    expect(result.current.user).toEqual(USER);
  });

  it("signs out when the server actively rejects the session", async () => {
    const { result } = await renderAuth({
      store: makeStore({ hasSession: true }),
      cache: makeCache({ user: USER }),
      client: {
        me: jest.fn(async () => {
          throw new ApiError(401, "unauthorized", "Not authenticated.");
        }),
      },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("does not sign in offline with no cached user to show", async () => {
    const { result } = await renderAuth({
      store: makeStore({ hasSession: true }),
      cache: makeCache({ user: null }),
      client: {
        me: jest.fn(async () => {
          throw new NetworkError(new Error("offline"));
        }),
      },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(false);
  });
});

describe("signIn", () => {
  it("stores the session and caches the user", async () => {
    const store = makeStore();
    const cache = makeCache();
    const client = {
      me: jest.fn(),
      login: jest.fn(async () => ({
        user: USER,
        accessToken: "a1",
        refreshToken: "r1",
      })),
    };

    const { result } = await renderAuth({ store, cache, client });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signIn({
        email: "ada@example.com",
        password: "correct horse battery",
      });
    });

    expect(store.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "a1", refreshToken: "r1" }),
    );
    expect(cache.saveUser).toHaveBeenCalledWith(USER);
    expect(result.current.isSignedIn).toBe(true);
  });

  it("propagates a failure without changing auth state", async () => {
    const client = {
      me: jest.fn(),
      login: jest.fn(async () => {
        throw new ApiError(401, "unauthorized", "Email or password is incorrect.");
      }),
    };

    const { result } = await renderAuth({
      store: makeStore(),
      cache: makeCache(),
      client,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(
        result.current.signIn({ email: "a@b.c", password: "nope" }),
      ).rejects.toBeInstanceOf(ApiError);
    });

    expect(result.current.isSignedIn).toBe(false);
  });
});

describe("signUp", () => {
  it("sends the device timezone so the server can schedule correctly", async () => {
    const client = {
      me: jest.fn(),
      register: jest.fn(async () => ({
        user: USER,
        accessToken: "a1",
        refreshToken: "r1",
      })),
    };

    const { result } = await renderAuth({
      store: makeStore(),
      cache: makeCache(),
      client,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signUp({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        password: "correct horse battery",
      });
    });

    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: expect.any(String) }),
    );
  });
});

describe("signOut", () => {
  it("clears tokens and cache, even if the logout call fails", async () => {
    const store = makeStore({ hasSession: true });
    const cache = makeCache({ user: USER });
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      logout: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    };

    const { result } = await renderAuth({ store, cache, client });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    expect(store.clear).toHaveBeenCalled();
    expect(cache.clear).toHaveBeenCalledWith("u1");
    expect(result.current.isSignedIn).toBe(false);
  });
});

describe("deleteAccount", () => {
  it("clears local state after the server confirms", async () => {
    const store = makeStore({ hasSession: true });
    const cache = makeCache({ user: USER });
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      deleteAccount: jest.fn(async () => null),
    };

    const { result } = await renderAuth({ store, cache, client });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(client.deleteAccount).toHaveBeenCalled();
    expect(store.clear).toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(false);
  });
});

describe("updatePreferences", () => {
  it("merges the result into the cached user", async () => {
    const cache = makeCache({ user: USER });
    const client = {
      me: jest.fn(async () => ({ user: USER })),
      updatePreferences: jest.fn(async () => ({
        preferences: { tone: "gentle", categories: ["calm"] },
        timezone: "Europe/London",
      })),
    };

    const { result } = await renderAuth({
      store: makeStore({ hasSession: true }),
      cache,
      client,
    });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.updatePreferences({ tone: "gentle" });
    });

    expect(result.current.user.preferences.tone).toBe("gentle");
    expect(result.current.user.timezone).toBe("Europe/London");
    expect(cache.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Europe/London" }),
    );
  });
});

describe("useAuth outside a provider", () => {
  it("throws a useful error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    // renderHook is async and surfaces a render throw as a rejection.
    await expect(renderHook(() => useAuth())).rejects.toThrow(/AuthProvider/);
    spy.mockRestore();
  });
});

describe("AuthProvider — replaying offline writes", () => {
  const signedIn = () => ({
    store: makeStore({ hasSession: true }),
    cache: makeCache({ user: USER }),
    client: { me: jest.fn(async () => ({ user: USER })) },
  });

  const makeOutbox = ({ pending = [], result }) => ({
    add: jest.fn(async () => {}),
    pending: jest.fn(async () => pending),
    flush: jest.fn(async () => result),
  });

  it("flushes the queue on sign-in and tells the data hooks to refetch", async () => {
    const outbox = makeOutbox({
      pending: [{ key: "seen:2026-08-05" }],
      result: { pending: [], rejected: [], offline: false },
    });

    const { result } = await renderAuth({ ...signedIn(), outbox });

    await waitFor(() => expect(outbox.flush).toHaveBeenCalledWith("u1"));
    // Something reached the server, so the optimistic UI can be replaced.
    await waitFor(() => expect(result.current.syncToken).toBe(1));
  });

  it("does not touch the network when there is nothing queued", async () => {
    const outbox = makeOutbox({
      pending: [],
      result: { pending: [], rejected: [], offline: false },
    });

    const { result } = await renderAuth({ ...signedIn(), outbox });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    expect(outbox.flush).not.toHaveBeenCalled();
    expect(result.current.syncToken).toBe(0);
  });

  it("leaves the hooks alone when the flush found the server still unreachable", async () => {
    const queued = [{ key: "seen:2026-08-05" }];
    const outbox = makeOutbox({
      pending: queued,
      result: { pending: queued, rejected: [], offline: true },
    });

    const { result } = await renderAuth({ ...signedIn(), outbox });

    await waitFor(() => expect(result.current.offline).toBe(true));
    // Nothing was replayed, so there is nothing new to refetch.
    expect(result.current.syncToken).toBe(0);
  });

  it("queues a preference change made offline and keeps it on screen", async () => {
    const outbox = makeOutbox({
      pending: [],
      result: { pending: [], rejected: [], offline: false },
    });
    const base = signedIn();
    const client = {
      ...base.client,
      updatePreferences: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    };

    const { result } = await renderAuth({ ...base, client, outbox });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.updatePreferences({ tone: "grounded" });
    });

    // A tone chosen on a plane is still the user's choice.
    expect(result.current.user.preferences.tone).toBe("grounded");
    expect(outbox.add).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ kind: "preferences", payload: { tone: "grounded" } }),
    );
  });

  it("does not queue a preference change the server refused", async () => {
    const outbox = makeOutbox({
      pending: [],
      result: { pending: [], rejected: [], offline: false },
    });
    const base = signedIn();
    const client = {
      ...base.client,
      updatePreferences: jest.fn(async () => {
        throw new ApiError(400, "invalid", "Not a tone.");
      }),
    };

    const { result } = await renderAuth({ ...base, client, outbox });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await expect(result.current.updatePreferences({ tone: "nope" })).rejects.toThrow(
        ApiError,
      );
    });

    expect(outbox.add).not.toHaveBeenCalled();
  });
});
