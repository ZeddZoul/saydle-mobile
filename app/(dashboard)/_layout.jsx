import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../contexts/ThemeContext.jsx";
import { useT } from "../../lib/i18n.js";
import { colors, fonts } from "../../theme/tokens.js";

/**
 * The root Stack hides its header for this whole group, so these headers come
 * from the Tabs navigator rather than a nested Stack — a nested Stack's header
 * options would be overridden and silently do nothing.
 *
 * Chrome follows the active theme, so a dark theme doesn't leave a bright coral
 * header and a white tab bar stranded around it.
 */
const DashboardLayout = () => {
  const { t } = useT();
  const { theme } = useAppTheme();

  // On a dark theme the chrome sits *with* the backdrop; on a light one the
  // header stays the brand coral it has always been.
  const headerBg = theme.dark ? theme.gradient[1] : theme.accent;
  const headerTint = theme.dark ? theme.ink : colors.white;
  const tabBg = theme.dark ? theme.gradient[1] : colors.white;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: headerBg },
        headerTintColor: headerTint,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.displayBold, fontSize: 20 },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.sub,
        tabBarStyle: {
          backgroundColor: tabBg,
          borderTopColor: theme.dark ? "rgba(255,255,255,0.08)" : "rgba(122,46,40,0.08)",
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("tabs.today"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "sunny" : "sunny-outline"} size={size} color={color} />
          ),
        }}
      />
      {/* Reached by tapping today's affirmation, not from the tab bar: it is a
          way of reading, not a section of the app. */}
      <Tabs.Screen name="stream" options={{ href: null, headerShown: false }} />
      {/* Reached from Profile: a place to go when you have something to write,
          not a fifth thing competing for the tab bar. */}
      <Tabs.Screen name="my-words" options={{ href: null, title: t("myWords.title") }} />
      <Tabs.Screen
        name="practice"
        options={{
          title: t("tabs.practice"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "flower" : "flower-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("tabs.favorites"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "heart" : "heart-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
};

export default DashboardLayout;
