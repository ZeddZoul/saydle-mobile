import { ApiError, NetworkError, SessionExpiredError } from "./errors.js";
import { API_URL, REQUEST_TIMEOUT_MS } from "./config.js";

/**
 * Builds an API client bound to a token store.
 *
 * The store is injected rather than imported so tests can drive this without
 * touching SecureStore.
 *
 * @param {object} options
 * @param {object} options.store        token store (see lib/tokenStore.js)
 * @param {function} options.onSessionExpired called when the server rejects our
 *                                      refresh token — never on a network failure
 */
export function createApiClient({
  store,
  baseUrl = API_URL,
  onSessionExpired = () => {},
  fetchImpl = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  // Concurrent 401s must trigger one refresh, not one per in-flight request —
  // otherwise the first rotation invalidates the others and the server revokes
  // the whole token family as a replay.
  let refreshPromise = null;

  async function raw(path, { method = "GET", body, token, signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
      signal.addEventListener?.("abort", () => controller.abort(), { once: true });
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      // fetch rejects for offline, DNS failure, TLS, and our own timeout abort.
      // None of these say anything about whether the session is still valid.
      throw new NetworkError(cause);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 204) return null;

    let payload = null;
    try {
      const text = await response.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = payload?.error ?? {};
      throw new ApiError(
        response.status,
        error.code ?? "unknown",
        error.message,
        error.details,
      );
    }

    return payload;
  }

  async function doRefresh() {
    const refreshToken = await store.getRefreshToken();

    if (!refreshToken) {
      await endSession();
      throw new SessionExpiredError();
    }

    let payload;
    try {
      payload = await raw("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken },
      });
    } catch (err) {
      // THE important branch. Unreachable server means "try again later", not
      // "you are signed out" — clearing here would break offline entirely.
      if (err instanceof NetworkError) throw err;

      await endSession();
      throw new SessionExpiredError();
    }

    await store.setSession(payload);
    return payload;
  }

  async function endSession() {
    await store.clear();
    onSessionExpired();
  }

  function refresh() {
    refreshPromise ??= doRefresh().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  /**
   * Authenticated by default. Pass `auth: false` for register/login/refresh.
   * A single 401 triggers one refresh and one retry; a second 401 is real.
   */
  async function request(path, options = {}) {
    const { auth = true, ...rest } = options;

    if (!auth) return raw(path, rest);

    const token = await store.getAccessToken();

    try {
      return await raw(path, { ...rest, token });
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;

      await refresh();
      const fresh = await store.getAccessToken();
      return raw(path, { ...rest, token: fresh });
    }
  }

  return {
    request,
    // Exposed for tests and for the rare caller that needs to force a rotation.
    refresh,

    register: (body) =>
      request("/api/auth/register", { method: "POST", body, auth: false }),
    login: (body) =>
      request("/api/auth/login", { method: "POST", body, auth: false }),
    logout: (refreshToken) =>
      request("/api/auth/logout", {
        method: "POST",
        body: { refreshToken },
        auth: false,
      }),
    forgotPassword: (email) =>
      request("/api/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
    resetPassword: (body) =>
      request("/api/auth/reset-password", { method: "POST", body, auth: false }),

    me: () => request("/api/auth/me"),
    sendEmailVerification: () =>
      request("/api/auth/verify-email/send", { method: "POST" }),
    verifyEmail: (code) =>
      request("/api/auth/verify-email", { method: "POST", body: { code } }),
    deleteAccount: () => request("/api/auth/me", { method: "DELETE" }),

    today: () => request("/api/affirmations/today"),
    feed: (days) => request(`/api/affirmations/feed?days=${days}`),
    history: ({ days = 30, before } = {}) =>
      request(
        `/api/affirmations/history?days=${days}${before ? `&before=${before}` : ""}`,
      ),
    markSeen: (date) =>
      request(`/api/affirmations/feed/${date}/seen`, { method: "POST" }),

    favorites: () => request("/api/affirmations/favorites"),
    addFavorite: (id) =>
      request(`/api/affirmations/${id}/favorite`, { method: "PUT" }),
    removeFavorite: (id) =>
      request(`/api/affirmations/${id}/favorite`, { method: "DELETE" }),

    customAffirmations: () => request("/api/affirmations/custom"),
    createCustomAffirmation: (text) =>
      request("/api/affirmations/custom", { method: "POST", body: { text } }),
    deleteCustomAffirmation: (id) =>
      request(`/api/affirmations/custom/${id}`, { method: "DELETE" }),

    categories: () => request("/api/categories"),
    preferences: () => request("/api/preferences"),
    updatePreferences: (body) =>
      request("/api/preferences", { method: "PATCH", body }),

    profile: () => request("/api/profile"),
    updateProfile: (body) =>
      request("/api/profile", { method: "PATCH", body }),

    streak: () => request("/api/streak"),

    subscription: () => request("/api/subscription"),
    startTrial: () => request("/api/subscription/trial", { method: "POST" }),
  };
}
