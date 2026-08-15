import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { radius, spacing, type } from "../theme/tokens.js";

/**
 * What happens, and when, before anyone is charged.
 *
 * The anxiety a trial produces is not about the price — it is not knowing which
 * day the money leaves. A rail with dated steps answers that in one glance, and
 * naming the charge date plainly is what makes "you won't be charged today"
 * believable rather than a thing apps say.
 *
 * The rail is filled up to the step you're on and empty past it, so where you
 * are in the trial is legible without reading a word.
 */
const Step = ({ step, isLast, theme }) => (
  <View style={styles.step}>
    <View style={styles.gutter}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: step.reached ? theme.accent : theme.surfaceStrong,
            borderColor: step.reached ? theme.accent : theme.border,
          },
        ]}
      >
        <Ionicons
          name={step.icon}
          size={13}
          color={step.reached ? theme.surface : theme.sub}
        />
      </View>
      {!isLast && (
        <View
          style={[
            styles.rail,
            { backgroundColor: step.reached ? theme.accent : theme.border },
          ]}
        />
      )}
    </View>

    <View style={styles.body}>
      <DisplayText
        weight="bold"
        style={[
          styles.title,
          { color: theme.ink },
          step.done && styles.struck,
        ]}
      >
        {step.title}
      </DisplayText>
      <Text style={[styles.detail, { color: theme.sub }]}>{step.detail}</Text>
    </View>
  </View>
);

const TrialTimeline = ({ steps }) => {
  const { theme } = useAppTheme();

  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="summary"
      testID="trial-timeline"
    >
      {steps.map((step, i) => (
        <Step key={step.key} step={step} isLast={i === steps.length - 1} theme={theme} />
      ))}
    </View>
  );
};

export default TrialTimeline;

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  step: { flexDirection: "row", gap: spacing.md },
  gutter: { alignItems: "center", width: 26 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Grows to whatever the row beside it needs, so a two-line step doesn't break
  // the rail into floating segments.
  rail: { width: 2, flex: 1, minHeight: 18, marginVertical: 2 },
  body: { flex: 1, paddingBottom: spacing.lg },
  title: { fontSize: 17 },
  struck: { textDecorationLine: "line-through", opacity: 0.55 },
  detail: { ...type.body, fontSize: 13, marginTop: 2 },
});
