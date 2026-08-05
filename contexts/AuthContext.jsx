import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { createApiClient } from "../lib/api.js";
import { createTokenStore } from "../lib/tokenStore.js";
import { createCache } from "../lib/cache.js";
import { createOutbox, ops } from "../lib/outbox.js";
import { NetworkError } from "../lib/errors.js";
import { deviceTimezone } from "../lib/dates.js";
import { clearWidget } from "../lib/widget.js";
import { detectLocale } from "../lib/i18n.js";

const AuthContext = createContext(null);

// "loading" until bootstrap settles, so route guards don't bounce a signed-in
// user to the login screen for a frame while tokens are read from the Keychain.
const LOADING = "loading";
const SIGNED_IN = "signedIn";
const SIGNED_OUT = "signedOut";

export function AuthProvider({
  children,
  store: injectedStore,
  cache: injectedCache,
  client: injectedClient,
  outbox: injectedOutbox,
}) {
  const [status, setStatus] = useState(LOADING);
  const [user, setUser] = useState(null);
  const [offline, setOffline] = useState(false);
  // Bumped after a flush that actually replayed something, so the data hooks
  // can refetch and stop showing purely optimistic state.
  const [syncToken, setSyncToken] = useState(0);

  const store = useMemo(() => injectedStore ?? createTokenStore(), [injectedStore]);
  const cache = useMemo(() => injectedCache ?? createCache(), [injectedCache]);

  // Built once. onSessionExpired fires only when the server rejects our refresh
  // token — never on a network failure — so this cannot sign anyone out offline.
  const clientRef = useRef(null);
  if (clientRef.current === null) {
    clientRef.current =
      injectedClient ??
      createApiClient({
        store,
        onSessionExpired: () => {
          setUser(null);
          setStatus(SIGNED_OUT);
        },
      });
  }
  const client = clientRef.current;

  const outbox = useMemo(
    () => injectedOutbox ?? createOutbox({ cache, client }),
    [injectedOutbox, cache, client],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!(await store.hasSession())) {
        if (!cancelled) setStatus(SIGNED_OUT);
        return;
      }

      // Show the app immediately from cache, then confirm with the server.
      const cachedUser = await cache.loadUser();
      if (cachedUser && !cancelled) {
        setUser(cachedUser);
        setStatus(SIGNED_IN);
      }

      try {
        const { user: fresh } = await client.me();
        if (cancelled) return;
        setUser(fresh);
        setStatus(SIGNED_IN);
        setOffline(false);
        await cache.saveUser(fresh);
      } catch (err) {
        if (cancelled) return;

        if (err instanceof NetworkError) {
          // Unreachable server. We still hold valid tokens, so stay signed in
          // if there's a cached user to render.
          setOffline(true);
          setStatus(cachedUser ? SIGNED_IN : SIGNED_OUT);
          return;
        }

        // The server rejected us; onSessionExpired has already cleared tokens.
        setUser(null);
        setStatus(SIGNED_OUT);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, store, cache]);

  /**
   * Replays anything written offline. Called on sign-in and every time the app
   * comes back to the foreground — which is when a phone that was on a train is
   * most likely to have found signal again.
   */
  useEffect(() => {
    const userId = user?.id;
    if (status !== SIGNED_IN || !userId) return;

    let cancelled = false;

    const sync = async () => {
      const before = (await outbox.pending(userId)).length;
      if (before === 0) return;

      const result = await outbox.flush(userId);
      if (cancelled) return;

      setOffline(result.offline);
      // Something actually reached the server — let the data hooks refetch so
      // the UI stops relying on the optimistic copy.
      if (result.pending.length < before) setSyncToken((n) => n + 1);
    };

    sync().catch(() => {
      /* A flush failure is not a user-facing event; the queue is still there. */
    });

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") sync().catch(() => {});
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [status, user?.id, outbox]);

  async function adoptSession(payload) {
    await store.setSession(payload);
    await cache.saveUser(payload.user);
    setUser(payload.user);
    setStatus(SIGNED_IN);
    setOffline(false);
    return payload.user;
  }

  const value = useMemo(
    () => ({
      status,
      user,
      offline,
      isSignedIn: status === SIGNED_IN,
      isLoading: status === LOADING,
      client,
      cache,
      outbox,
      syncToken,

      async signIn({ email, password }) {
        return adoptSession(await client.login({ email, password }));
      },

      async signUp({ firstName, lastName, email, password }) {
        return adoptSession(
          await client.register({
            firstName,
            lastName,
            email,
            password,
            timezone: deviceTimezone(),
            // The device's language, but only if we can actually generate and
            // moderate in it — otherwise the server stores English.
            locale: detectLocale(),
          }),
        );
      },

      async signOut() {
        const refreshToken = await store.getRefreshToken();

        // Best effort: a failed logout call must not strand the user in a
        // signed-in shell they asked to leave.
        try {
          if (refreshToken) await client.logout(refreshToken);
        } catch {
          /* ignored on purpose */
        }

        await store.clear();
        await cache.clear(user?.id);
        // A widget outliving the session would leave someone's affirmations on
        // the home screen of a phone they just signed out of.
        clearWidget();
        setUser(null);
        setStatus(SIGNED_OUT);
      },

      async deleteAccount() {
        await client.deleteAccount();
        await store.clear();
        await cache.clear(user?.id);
        clearWidget();
        setUser(null);
        setStatus(SIGNED_OUT);
      },

      /**
       * Replaces the cached user with a fresher copy the server just returned —
       * used where an endpoint changes the account rather than its preferences.
       */
      async adoptUser(fresh) {
        setUser(fresh);
        await cache.saveUser(fresh);
        return fresh;
      },

      async updatePreferences(patch) {
        try {
          const result = await client.updatePreferences(patch);
          const next = {
            ...user,
            preferences: result.preferences,
            timezone: result.timezone,
            // Top-level on the user, not inside preferences — it selects the
            // safety rules and curated bank, so the server owns it.
            locale: result.locale ?? user?.locale,
          };
          setUser(next);
          await cache.saveUser(next);
          setOffline(false);
          return result;
        } catch (err) {
          // Server refused: nothing to queue, the caller shows the error.
          if (!(err instanceof NetworkError)) throw err;

          // Unreachable: keep the change, replay it later. A tone or reminder
          // window chosen on a plane is still the user's choice.
          await outbox.add(user?.id, ops.preferences(patch));

          const { locale, ...prefPatch } = patch;
          const next = {
            ...user,
            preferences: { ...user?.preferences, ...prefPatch },
            locale: locale ?? user?.locale,
          };
          setUser(next);
          await cache.saveUser(next);
          setOffline(true);
          return { preferences: next.preferences, queued: true };
        }
      },
    }),
    [status, user, offline, client, store, cache, outbox, syncToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }
  return context;
}
