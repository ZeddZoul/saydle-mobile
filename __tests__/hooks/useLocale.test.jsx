import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useLocale } from "../../hooks/useLocale.js";
import { i18next, setLocale, DEFAULT_LOCALE } from "../../lib/i18n.js";

const user = (over = {}) => ({ id: "u1", firstName: "Ada", locale: "en", ...over });

afterEach(() => setLocale(DEFAULT_LOCALE));

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache(cachedUser) {
  return {
    loadUser: jest.fn(async () => cachedUser),
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

const renderLocale = ({ cache, client }) =>
  renderHook(() => useLocale(), {
    wrapper: ({ children }) => (
      <AuthProvider store={makeStore()} cache={cache} client={client}>
        {children}
      </AuthProvider>
    ),
  });

describe("useLocale", () => {
  it("follows the account's language, not the device's", async () => {
    // Signing in on a borrowed phone should still read in your language.
    const spanish = user({ locale: "es" });
    const client = {
      me: jest.fn(async () => ({ user: spanish })),
      updatePreferences: jest.fn(),
    };

    const { result } = await renderLocale({ cache: makeCache(spanish), client });

    await waitFor(() => expect(i18next.language).toBe("es"));
    expect(result.current.locale).toBe("es");
  });

  it("applies a change locally and persists it to the account", async () => {
    const client = {
      me: jest.fn(async () => ({ user: user() })),
      updatePreferences: jest.fn(async () => ({
        preferences: {},
        locale: "es",
      })),
    };

    const { result } = await renderLocale({ cache: makeCache(user()), client });
    await waitFor(() => expect(result.current.locale).toBe("en"));

    await act(async () => {
      await result.current.setLocale("es");
    });

    expect(client.updatePreferences).toHaveBeenCalledWith({ locale: "es" });
    expect(i18next.language).toBe("es");
    expect(result.current.locale).toBe("es");
  });

  it("refuses a language that has not passed the gate", async () => {
    const client = {
      me: jest.fn(async () => ({ user: user() })),
      updatePreferences: jest.fn(),
    };

    const { result } = await renderLocale({ cache: makeCache(user()), client });
    await waitFor(() => expect(result.current.locale).toBe("en"));

    await act(async () => {
      await result.current.setLocale("fr");
    });

    // Nothing sent, nothing changed — we don't half-ship a language.
    expect(client.updatePreferences).not.toHaveBeenCalled();
    expect(i18next.language).toBe("en");
  });

  it("offers exactly the supported languages", async () => {
    const client = { me: jest.fn(async () => ({ user: user() })), updatePreferences: jest.fn() };
    const { result } = await renderLocale({ cache: makeCache(user()), client });

    await waitFor(() => expect(result.current.locales).toEqual(["en", "es"]));
  });
});
