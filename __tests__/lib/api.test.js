import { createApiClient } from "../../lib/api.js";
import { ApiError, NetworkError, SessionExpiredError } from "../../lib/errors.js";

function makeStore(initial = {}) {
  let accessToken = initial.accessToken ?? "access-1";
  let refreshToken = initial.refreshToken ?? "refresh-1";

  return {
    cleared: 0,
    getAccessToken: jest.fn(async () => accessToken),
    getRefreshToken: jest.fn(async () => refreshToken),
    hasSession: jest.fn(async () => Boolean(refreshToken)),
    setSession: jest.fn(async (payload) => {
      accessToken = payload.accessToken;
      refreshToken = payload.refreshToken;
    }),
    clear: jest.fn(async function clear() {
      accessToken = null;
      refreshToken = null;
      this.cleared += 1;
    }),
  };
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const noContent = () => ({ ok: true, status: 204, text: async () => "" });

describe("request", () => {
  it("attaches the bearer token", async () => {
    const store = makeStore();
    const fetchImpl = jest.fn(async () => jsonResponse(200, { ok: true }));
    const client = createApiClient({ store, fetchImpl, baseUrl: "http://api" });

    await client.request("/api/auth/me");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer access-1" }),
      }),
    );
  });

  it("omits the token when auth is false", async () => {
    const store = makeStore();
    const fetchImpl = jest.fn(async () => jsonResponse(200, {}));
    const client = createApiClient({ store, fetchImpl, baseUrl: "http://api" });

    await client.request("/api/auth/login", { auth: false, method: "POST" });

    const headers = fetchImpl.mock.calls[0][1].headers;
    expect(headers.authorization).toBeUndefined();
  });

  it("returns null for 204 rather than trying to parse a body", async () => {
    const store = makeStore();
    const client = createApiClient({
      store,
      fetchImpl: async () => noContent(),
      baseUrl: "http://api",
    });

    await expect(client.request("/api/whatever")).resolves.toBeNull();
  });

  it("turns an error body into an ApiError with details", async () => {
    const store = makeStore();
    const client = createApiClient({
      store,
      baseUrl: "http://api",
      fetchImpl: async () =>
        jsonResponse(400, {
          error: {
            code: "bad_request",
            message: "Request validation failed.",
            details: { email: "Enter a valid email address." },
          },
        }),
    });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.isValidation).toBe(true);
    expect(error.details.email).toBe("Enter a valid email address.");
  });

  it("survives an error response with no parseable body", async () => {
    const store = makeStore();
    const client = createApiClient({
      store,
      baseUrl: "http://api",
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        text: async () => "<html>gateway</html>",
      }),
    });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
  });
});

describe("network failures", () => {
  it("raises NetworkError when fetch rejects", async () => {
    const store = makeStore();
    const client = createApiClient({
      store,
      baseUrl: "http://api",
      fetchImpl: async () => {
        throw new TypeError("Network request failed");
      },
    });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.isNetwork).toBe(true);
  });

  it("does not clear the session on a network failure", async () => {
    const store = makeStore();
    const onSessionExpired = jest.fn();
    const client = createApiClient({
      store,
      onSessionExpired,
      baseUrl: "http://api",
      fetchImpl: async () => {
        throw new TypeError("Network request failed");
      },
    });

    await client.request("/api/x").catch(() => {});

    expect(store.clear).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("treats a timeout as a network failure", async () => {
    const store = makeStore();
    const client = createApiClient({
      store,
      baseUrl: "http://api",
      timeoutMs: 10,
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new Error("The operation was aborted")),
          );
        }),
    });

    await expect(client.request("/api/x")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("token refresh", () => {
  it("refreshes once on 401 and retries the original request", async () => {
    const store = makeStore();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "unauthorized" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: "u1" } }));

    const client = createApiClient({ store, fetchImpl, baseUrl: "http://api" });

    const result = await client.request("/api/auth/me");

    expect(result).toEqual({ user: { id: "u1" } });
    expect(store.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-2" }),
    );
    // The retry carries the new token, not the stale one.
    expect(fetchImpl.mock.calls[2][1].headers.authorization).toBe("Bearer access-2");
  });

  it("refreshes only once for several concurrent 401s", async () => {
    // Rotation invalidates the previous refresh token, so parallel refreshes
    // would look like a replay and get the whole family revoked server-side.
    const store = makeStore();
    let refreshCalls = 0;

    const fetchImpl = jest.fn(async (url) => {
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          accessToken: `access-${refreshCalls + 1}`,
          refreshToken: `refresh-${refreshCalls + 1}`,
        });
      }
      const token = await store.getAccessToken();
      if (token === "access-1") {
        return jsonResponse(401, { error: { code: "unauthorized" } });
      }
      return jsonResponse(200, { ok: true });
    });

    const client = createApiClient({ store, fetchImpl, baseUrl: "http://api" });

    await Promise.all([
      client.request("/api/a"),
      client.request("/api/b"),
      client.request("/api/c"),
    ]);

    expect(refreshCalls).toBe(1);
  });

  it("gives up after one retry if the fresh token is also rejected", async () => {
    const store = makeStore();
    const fetchImpl = jest.fn(async (url) => {
      if (url.endsWith("/api/auth/refresh")) {
        return jsonResponse(200, {
          accessToken: "access-2",
          refreshToken: "refresh-2",
        });
      }
      return jsonResponse(401, { error: { code: "unauthorized" } });
    });

    const client = createApiClient({ store, fetchImpl, baseUrl: "http://api" });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
  });

  it("signs the user out when the server rejects the refresh token", async () => {
    const store = makeStore();
    const onSessionExpired = jest.fn();
    const fetchImpl = jest.fn(async (url) =>
      url.endsWith("/api/auth/refresh")
        ? jsonResponse(401, { error: { code: "unauthorized" } })
        : jsonResponse(401, { error: { code: "unauthorized" } }),
    );

    const client = createApiClient({
      store,
      onSessionExpired,
      fetchImpl,
      baseUrl: "http://api",
    });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(store.clear).toHaveBeenCalled();
    expect(onSessionExpired).toHaveBeenCalled();
  });

  it("does NOT sign the user out when refresh fails for lack of network", async () => {
    // The regression this whole design exists to prevent: opening the app
    // offline must not log you out.
    const store = makeStore();
    const onSessionExpired = jest.fn();

    const fetchImpl = jest.fn(async (url) => {
      if (url.endsWith("/api/auth/refresh")) {
        throw new TypeError("Network request failed");
      }
      return jsonResponse(401, { error: { code: "unauthorized" } });
    });

    const client = createApiClient({
      store,
      onSessionExpired,
      fetchImpl,
      baseUrl: "http://api",
    });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect(store.clear).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(await store.getRefreshToken()).toBe("refresh-1");
  });

  it("signs out when there is no refresh token at all", async () => {
    const store = makeStore({ refreshToken: null });
    const onSessionExpired = jest.fn();

    const client = createApiClient({
      store,
      onSessionExpired,
      baseUrl: "http://api",
      fetchImpl: async () => jsonResponse(401, { error: { code: "unauthorized" } }),
    });

    const error = await client.request("/api/x").catch((e) => e);

    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(onSessionExpired).toHaveBeenCalled();
  });
});

describe("endpoint helpers", () => {
  it("builds the expected paths and methods", async () => {
    const store = makeStore();
    const fetchImpl = jest.fn(async () => jsonResponse(200, {}));
    const client = createApiClient({ store, fetchImpl, baseUrl: "http://api" });

    await client.feed(30);
    await client.markSeen("2026-08-03");
    await client.addFavorite("abc");
    await client.removeFavorite("abc");
    await client.updatePreferences({ tone: "gentle" });

    const calls = fetchImpl.mock.calls.map(([url, opts]) => [url, opts.method]);

    expect(calls).toEqual([
      ["http://api/api/affirmations/feed?days=30", "GET"],
      ["http://api/api/affirmations/feed/2026-08-03/seen", "POST"],
      ["http://api/api/affirmations/abc/favorite", "PUT"],
      ["http://api/api/affirmations/abc/favorite", "DELETE"],
      ["http://api/api/preferences", "PATCH"],
    ]);
  });
});
