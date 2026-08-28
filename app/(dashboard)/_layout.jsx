import { Tabs } from "expo-router";
import { useT } from "../../lib/i18n.js";

/**
 * Routing only. The navigator draws nothing.
 *
 * A header bar and a tab bar cost about 170dp between them — a quarter of a
 * phone screen, spent permanently on furniture, around a product whose whole
 * content is one sentence. Both are gone: the backdrop now runs edge to edge and
 * the controls float over it (components/FloatingChrome.jsx).
 *
 * The Tabs navigator stays because the routes and their state do — swapping it
 * for a Stack would remount every screen on each move and lose scroll position
 * in the library.
 */
const DashboardLayout = () => {
  const { t } = useT();

  return (
    <Tabs
      // A Navigator prop, not a screen option — passing it in `screenOptions`
      // is silently ignored and the bar stays exactly where it was. Rendering
      // nothing rather than hiding it with `display: none`, because a hidden
      // bar still reserves layout and every paged screen would then be laid out
      // taller than the space it can actually use.
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("tabs.today"),
        }}
      />
      {/* Reached by tapping today's affirmation, not from the tab bar: it is a
          way of reading, not a section of the app. */}
      <Tabs.Screen
        name="stream"
        options={{
          href: null,
          headerShown: false,
          // `href: null` only hides it from the bar; the screen still renders
          // inside the navigator. Without this the tab bar stays on screen and
          // — worse — each page is laid out at full window height while the
          // visible area is shorter, so paging drifts a little further off with
          // every swipe.
        }}
      />
      {/* Reached from Profile: a place to go when you have something to write,
          not a fifth thing competing for the tab bar. */}
      <Tabs.Screen name="my-words" options={{ href: null, title: t("myWords.title") }} />
      {/* Same treatment as the stream: paged full-screen, so the tab bar has to
          go or every page is laid out taller than the visible area. */}
      <Tabs.Screen
        name="library"
        options={{
          href: null,
          title: t("library.title"),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: t("tabs.practice"),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t("tabs.favorites"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
        }}
      />
      {/* Both reached from the floating chrome's own buttons, so neither belongs
          in the bar — and the bar draws nothing anyway. Registered explicitly so
          the title is translated rather than inferred from the filename. */}
      <Tabs.Screen name="themes" options={{ href: null, title: t("profile.theme") }} />
      <Tabs.Screen name="billing" options={{ href: null, title: t("billing.title") }} />
    </Tabs>
  );
};

export default DashboardLayout;
