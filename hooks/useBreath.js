import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * A breathing rhythm to say a line to, as a value something else can render.
 *
 * This was a self-contained component with its own ring. That put two animated
 * circles on the practice screen — one pacing, one showing progress — competing
 * for the same glance. As a hook it drives the disc inside the progress ring
 * instead, so pacing and progress are one shape.
 *
 * Phases are deliberately unequal: the inhale sets you up, the saying gets the
 * longest hold because it is the part that matters, and the exhale is short
 * enough that the next round doesn't feel like waiting.
 */
export const BREATH_PHASES = [
  { key: "in", ms: 2600, to: 1, label: "practice.breatheIn" },
  { key: "say", ms: 3400, to: 1, label: "practice.sayIt" },
  { key: "out", ms: 2400, to: 0.72, label: "practice.letGo" },
];

export function useBreath(active, onCycle) {
  const scale = useRef(new Animated.Value(0.72)).current;
  const [phase, setPhase] = useState(0);

  // Refs, not state: the animation chain reads both on every step, and a stale
  // closure would keep the ring breathing after the screen had moved on.
  const running = useRef(active);
  running.current = active;
  const cycle = useRef(onCycle);
  cycle.current = onCycle;

  useEffect(() => {
    if (!active) {
      scale.stopAnimation();
      Animated.timing(scale, {
        toValue: 0.72, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }).start();
      setPhase(0);
      return undefined;
    }

    let cancelled = false;
    let index = 0;

    const step = () => {
      if (cancelled || !running.current) return;
      const current = BREATH_PHASES[index];
      setPhase(index);

      Animated.timing(scale, {
        toValue: current.to,
        duration: current.ms,
        easing: current.key === "say" ? Easing.linear : Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || cancelled || !running.current) return;
        const wasLast = index === BREATH_PHASES.length - 1;
        index = wasLast ? 0 : index + 1;
        if (wasLast) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          cycle.current?.();
        }
        step();
      });
    };

    step();
    return () => {
      cancelled = true;
      scale.stopAnimation();
    };
  }, [active, scale]);

  return { scale, label: active ? BREATH_PHASES[phase].label : null };
}
