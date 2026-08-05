import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_KEY = "saydle.accessToken";
const REFRESH_KEY = "saydle.refreshToken";

/**
 * SecureStore is backed by the Keychain / Keystore and has no web
 * implementation, so the web build falls back to AsyncStorage.
 *
 * That fallback is deliberately weaker: on web the refresh token sits in
 * localStorage, readable by any script on the origin. Acceptable for a dev web
 * build; revisit before treating web as a shipping target.
 */
const nativeBackend = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

const webBackend = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

/**
 * Tokens are mirrored in memory so the common path (attaching a bearer header)
 * doesn't hit the Keychain on every request.
 */
export function createTokenStore(
  backend = Platform.OS === "web" ? webBackend : nativeBackend,
) {
  let accessToken = null;
  let refreshToken = null;
  let hydrated = false;

  async function hydrate() {
    if (hydrated) return;
    const [access, refresh] = await Promise.all([
      backend.get(ACCESS_KEY),
      backend.get(REFRESH_KEY),
    ]);
    accessToken = access ?? null;
    refreshToken = refresh ?? null;
    hydrated = true;
  }

  return {
    async getAccessToken() {
      await hydrate();
      return accessToken;
    },

    async getRefreshToken() {
      await hydrate();
      return refreshToken;
    },

    async hasSession() {
      await hydrate();
      return Boolean(refreshToken);
    },

    /** Accepts an auth response body: { accessToken, refreshToken, user? }. */
    async setSession({ accessToken: access, refreshToken: refresh }) {
      accessToken = access ?? null;
      refreshToken = refresh ?? null;
      hydrated = true;

      await Promise.all([
        access ? backend.set(ACCESS_KEY, access) : backend.remove(ACCESS_KEY),
        refresh ? backend.set(REFRESH_KEY, refresh) : backend.remove(REFRESH_KEY),
      ]);
    },

    async clear() {
      accessToken = null;
      refreshToken = null;
      hydrated = true;
      await Promise.all([backend.remove(ACCESS_KEY), backend.remove(REFRESH_KEY)]);
    },
  };
}
