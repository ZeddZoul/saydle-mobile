import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow, spacing } from "../theme/tokens.js";

/**
 * A lightweight, dependency-free toast. Built on the design tokens and the
 * built-in Animated API rather than a package, so it stays Expo Go-safe, matches
 * the brand exactly, and adds nothing to version. Swappable for
 * react-native-toast-message later without touching call sites — the useToast()
 * surface is all consumers see.
 */
const ToastContext = createContext(null);

const DURATION = 2600;

const VARIANTS = {
  success: { icon: "checkmark-circle", color: "#2E9E6B" },
  error: { icon: "alert-circle", color: colors.danger },
  info: { icon: "information-circle", color: colors.mauveDeep },
};

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback(
    (message, variant = "info") => {
      if (!message) return;
      if (timer.current) clearTimeout(timer.current);
      seq.current += 1;
      setToast({ message, variant, key: seq.current });
      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }).start();
      timer.current = setTimeout(hide, DURATION);
    },
    [anim, hide],
  );

  // Clear the pending auto-dismiss on unmount so a timer never outlives the tree.
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  const api = useMemo(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  const variant = VARIANTS[toast?.variant] ?? VARIANTS.info;

  return (
    <ToastContext.Provider value={api}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              {
                top: insets.top + spacing.sm,
                opacity: anim,
                transform: [
                  {
                    translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name={variant.icon} size={20} color={variant.color} />
            <Text style={styles.message} accessibilityRole="alert">
              {toast.message}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside a ToastProvider.");
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  message: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
  },
});
