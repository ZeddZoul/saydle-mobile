import { useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, shadow, spacing } from "../theme/tokens.js";
import { useAppTheme } from "../contexts/ThemeContext.jsx";

/**
 * Primary (coral gradient, lifted) and secondary (mauve outline) button.
 *
 * Presses spring the button down a touch and fire a light haptic — the small
 * tactile cues that separate a designed app from a wired-up form. Disables
 * itself while `loading` so a double tap can't submit twice.
 */
const Button = ({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  // Passed through so callers can attach a testID or an explicit
  // accessibilityLabel without wrapping the button in another view.
  ...rest
}) => {
  const { theme } = useAppTheme();
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  const handlePress = (event) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.(event);
  };

  const isPrimary = variant === "primary";

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : theme.accent} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary ? styles.primaryLabel : [styles.secondaryLabel, { color: theme.sub }],
          ]}
        >
          {title}
        </Text>
      )}
    </>
  );

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        !isDisabled && isPrimary && [shadow.button, { shadowColor: theme.accent }],
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={() => !isDisabled && spring(0.97)}
        onPressOut={() => spring(1)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={styles.press}
        {...rest}
      >
        {isPrimary ? (
          <LinearGradient
            colors={
              isDisabled ? [theme.border, theme.border] : [theme.accentSoft, theme.accent]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, isDisabled && styles.disabled]}
          >
            {inner}
          </LinearGradient>
        ) : (
          <Animated.View
            style={[
              styles.base,
              styles.secondary,
              { borderColor: theme.border, backgroundColor: theme.surface },
              isDisabled && styles.disabled,
            ]}
          >
            {inner}
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export default Button;

const styles = StyleSheet.create({
  press: {
    borderRadius: radius.lg,
  },
  base: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  secondary: {
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  primaryLabel: {
    color: colors.white,
  },
  secondaryLabel: {
    color: colors.mauveDeep,
  },
});
