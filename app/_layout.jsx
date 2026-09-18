import { useCallback, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import { AuthProvider, useAuth } from "../contexts/AuthContext.jsx";
import { ToastProvider } from "../contexts/ToastContext.jsx";
import { ThemeProvider, useAppTheme } from "../contexts/ThemeContext.jsx";
import GradientBackground from "../components/GradientBackground.jsx";
import { nextRoute } from "../lib/routeGuard.js";

// Hold the native splash until fonts are ready, so no screen flashes in the
// system font before Fraunces loads.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Route guard.
 *
 * Nothing renders until bootstrap settles, so a signed-in user opening the app
 * never sees the login screen flash while tokens are read from the Keychain.
 *
 * The paywall is hard: an account that has not paid reaches Billing and Profile
 * and nothing else — see lib/routeGuard.js, which owns that decision and is
 * where its reasoning lives. Entitlement is read from the session rather than
 * asked for here, which is what makes it survive a tunnel — `AuthContext` keeps
 * the cached user on a network failure, so a subscriber offline stays a
 * subscriber. Locking someone out of what they paid for because the server was
 * briefly unreachable would be worse than trusting a stale yes.
 */
const RootNavigator = () => {
  const { isLoading, isSignedIn, user } = useAuth();
  const entitled = Boolean(user?.subscription?.entitled);
  // This screen renders inside ThemeProvider, so it can follow the reader's
  // theme — the native splash before it cannot; see app.json.
  const { theme } = useAppTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const target = nextRoute({ isSignedIn, entitled, segments });
    if (target) router.replace(target);
  }, [isLoading, isSignedIn, entitled, segments, router]);

  if (isLoading) {
    return (
      <GradientBackground style={styles.splash} testID="auth-loading">
        <ActivityIndicator size="large" color={theme.accent} />
      </GradientBackground>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(dashboard)" />
    </Stack>
  );
};

const RootLayout = () => {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Fraunces_700Bold,
  });

  const onReady = useCallback(async () => {
    // A font load error shouldn't strand the user on a blank splash — fall back
    // to the system font rather than never revealing the app.
    if (fontsLoaded || fontError) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <ThemeProvider>
        <ToastProvider>
          <View style={styles.root} onLayout={onReady}>
            <RootNavigator />
          </View>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default RootLayout;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    alignItems: "center",
    justifyContent: "center",
  },
});
