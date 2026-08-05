import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, type } from "../theme/tokens.js";

/**
 * Label + input + inline error, with an optional leading icon and a focus state
 * (the border warms to coral). A password field grows a show/hide toggle.
 *
 * `error` takes the message the API returned for this field, so server-side
 * validation surfaces in the same place as anything checked locally.
 */
const FormField = ({ label, error, icon, secureTextEntry, style, ...inputProps }) => {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error && styles.fieldError,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.coral : colors.inkFaint}
            style={styles.icon}
          />
        ) : null}

        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={label}
          accessibilityInvalid={Boolean(error)}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
          >
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={18}
              color={colors.inkFaint}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
};

export default FormField;

const styles = StyleSheet.create({
  group: {
    marginBottom: spacing.lg,
  },
  label: {
    ...type.label,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    // A resting shadow so fields sit above the gradient rather than on it.
    shadowColor: "#7A2E28",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  fieldFocused: {
    borderColor: colors.coral,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: spacing.md,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.danger,
  },
});
