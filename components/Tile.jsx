import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import LineArt from "./LineArt.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { radius, spacing, type } from "../theme/tokens.js";

/**
 * A destination, drawn rather than listed.
 *
 * The label sits under the illustration, bottom-left, so a two-column grid of
 * these scans as a set of places rather than a stack of rows. Everything a tile
 * does is navigate — anything with state or a control in it belongs in a
 * section card instead, or the grid stops being scannable.
 */
const Tile = ({ art, label, onPress, testID }) => {
  const { theme } = useAppTheme();

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.surface },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.art} pointerEvents="none">
        <LineArt name={art} />
      </View>
      <Text style={[styles.label, { color: theme.ink }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
};

export default Tile;

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 168,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  art: { alignItems: "center", justifyContent: "center", flex: 1 },
  label: { ...type.body, fontSize: 15 },
  pressed: { opacity: 0.75 },
});
