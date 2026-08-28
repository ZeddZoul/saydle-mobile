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

// Hold the native splash until fonts are ready, so no screen flashes in the
// system font before Fraunces loads.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Route guard.
 *
 * Nothing renders until bootstrap settles, so a signed-in user opening the app
 * never sees the login screen flash while tokens are read from the Keychain.
 */
const RootNavigator = () => {
  const { isLoading, isSignedIn } = useAuth();
  // This screen renders inside ThemeProvider, so it can follow the reader's
  // theme — the native splash before it cannot; see app.json.
  const { theme } = useAppTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const seg = segments[0];
    const inDashboard = seg === "(dashboard)";

    if (!isSignedIn) {
      // The onboarding flow IS the sign-up — the account isn't created until its
      // end — so signed-out users are allowed to be in it. Only the app is gated.
      if (inDashboard) router.replace("/login");
    } else if (!inDashboard) {
      // Signed in (including the moment the flow creates the account) → the app.
      router.replace("/dashboard");
    }
  }, [isLoading, isSignedIn, segments, router]);

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
