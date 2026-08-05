import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getTheme, DEFAULT_THEME } from "../theme/themes.js";

/**
 * The active theme, app-wide.
 *
 * Provided rather than read per-screen so a theme change repaints everything at
 * once — background, type, tab bar, cards. `getTheme` guarantees a usable theme,
 * so a missing or unknown slug degrades to the default instead of crashing.
 *
 * Signed-out screens still get the default, which is what we want: the landing
 * and login are brand surfaces, not personalised ones.
 */
const ThemeContext = createContext(null);

export function ThemeProvider({ children, theme: injectedTheme }) {
  const { user, updatePreferences } = useAuth();
  const slug = injectedTheme ?? user?.preferences?.theme ?? DEFAULT_THEME;
  const theme = getTheme(slug);

  const setTheme = useCallback(
    (next) => updatePreferences({ theme: next }),
    [updatePreferences],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Used when a component renders outside the provider.
const FALLBACK = { theme: getTheme(DEFAULT_THEME), setTheme: () => {} };

/**
 * Unlike `useAuth`, this deliberately does NOT throw without a provider.
 * A theme is presentational: a component that somehow renders outside the tree
 * should fall back to the default look, not take the screen down with it.
 */
export function useAppTheme() {
  return useContext(ThemeContext) ?? FALLBACK;
}
