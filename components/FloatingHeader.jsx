import { StyleSheet, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { useT } from "../lib/i18n.js";
import { radius, spacing, type } from "../theme/tokens.js";

/**
 * A title and a way back, for the screens that are not Today.
 *
 * The navigator used to draw both. Now that it draws nothing, every screen
 * reached from the floating controls would otherwise be a dead end with no
 * label — which is a worse failure than the header bar ever was.
 *
 * Same language as FloatingChrome: a translucent pill over the backdrop rather
 * than a bar carved out of it.
 */
/**
 * How much room the header needs above scrolling content.
 *
 * Exported rather than repeated: the header overlays rather than occupies, so
 * every screen under it has to reserve the same space, and four copies of a
 * magic number drift apart the first time the button size changes. It is the
 * status-bar inset plus the button and its padding.
 */
export const FLOATING_HEADER_INSET = 116;

const BUTTON = 44;

const FloatingHeader = ({ title, onBack }) => {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useT();

  const back = () => {
    if (onBack) return onBack();
    // `canGoBack` matters: these screens are also reachable directly, and
    // `back()` on an empty stack does nothing at all — a button that silently
    // fails is worse than one that always lands somewhere sensible.
    if (router.canGoBack()) router.back();
    else router.replace("/dashboard");
  };

  return (
    <SafeAreaView style={styles.wrap} pointerEvents="box-none" edges={["top"]}>
      <View style={styles.row} pointerEvents="box-none">
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={12}
          testID="floating-back"
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.55)",
              borderColor: theme.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.ink} />
        </Pressable>

        {title ? (
          <DisplayText weight="bold" style={[styles.title, { color: theme.ink }]}>
            {title}
          </DisplayText>
        ) : null}

        {/* Reserves the back button's width so the title stays optically
            centred. Deliberately NOT styles.button: that carries a border, and
            with no borderColor set it renders as a black ring — a control that
            looks tappable and does nothing. */}
        <View style={styles.spacer} pointerEvents="none" />
      </View>
    </SafeAreaView>
  );
};

export default FloatingHeader;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { width: BUTTON, height: BUTTON },
  title: { ...type.sectionTitle, fontSize: 18 },
  pressed: { opacity: 0.7 },
});
