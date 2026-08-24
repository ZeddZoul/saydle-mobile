import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DisplayText from "./DisplayText.jsx";
import { useAppTheme } from "../contexts/ThemeContext.jsx";
import { playClip, stopSpeaking } from "../lib/voice.js";
import { spacing, type } from "../theme/tokens.js";

/** Held after a line finishes, before the next fades in. */
const REST_MS = 1400;
const FADE_MS = 700;

/**
 * Seven lines, read aloud, one at a time.
 *
 * The whole screen is the line. No chrome beyond a pause and a way out,
 * because the reference this is modelled on works for exactly one reason:
 * nothing on screen competes with the sentence, and time is allowed to pass.
 * A progress bar counting down would make it a task.
 *
 * Text is driven by the voice, not by a timer — `onDone` from the speech
 * boundary advances the session. A timer would drift out of sync with the
 * reading on the first long line, and the drift compounds across seven.
 * The rest between lines is the only fixed interval, and it is silence on
 * purpose: the pause after a sentence is where it lands.
 */
const ListeningSession = ({ lines, voice, onFinish, onClose }) => {
  const { theme } = useAppTheme();

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  const timer = useRef(null);
  // Guards every async continuation: speech and timers both resolve after the
  // screen may have gone, and advancing a session nobody is watching would
  // keep talking into an empty room.
  const alive = useRef(true);

  useEffect(() => {
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      stopSpeaking();
    };
  }, []);

  const line = lines[index];
  const last = index >= lines.length - 1;

  const fadeTo = useCallback(
    (to, then) => {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: to,
          duration: FADE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rise, {
          toValue: to === 1 ? 0 : -12,
          duration: FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && alive.current) then?.();
      });
    },
    [fade, rise],
  );

  const advance = useCallback(() => {
    if (!alive.current) return;

    fadeTo(0, () => {
      if (last) return onFinish?.();

      rise.setValue(12);
      setIndex((i) => i + 1);
    });
  }, [fadeTo, last, onFinish, rise]);

  // Read the current line, then rest, then move on. Re-runs on `index` and on
  // resuming, which is what makes pause and play work without a second path.
  useEffect(() => {
    if (!line || !playing) return;

    let cancelled = false;
    fadeTo(1);

    // A rendered clip when the server had one, the device's own speech when it
    // did not. `playClip` decides, so a session with six clips and one failed
    // render still plays all seven — the reader hears a different voice for one
    // sentence rather than a gap.
    playClip(line.clipUrl, {
      text: line.text,
      // Whatever the reader chose — and for today only. A change made mid-week
      // lands tomorrow, which is what keeps a session's voice consistent from
      // its first line to its seventh. Only reaches device speech; a clip was
      // already rendered in the right voice.
      ...voice,
      onDone: () => {
        if (cancelled || !alive.current) return;
        timer.current = setTimeout(advance, REST_MS);
      },
    });

    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      stopSpeaking();
    };
    // `voice` is read but deliberately not a dependency: a preference that
    // changed while a line was being read would restart it mid-sentence.
  }, [line?.id, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    Haptics.selectionAsync().catch(() => {});
    setPlaying((p) => !p);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onClose}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.close}
        testID="session-close"
      >
        <Ionicons name="close" size={22} color={theme.sub} />
      </Pressable>

      <Animated.View
        style={[styles.lineWrap, { opacity: fade, transform: [{ translateY: rise }] }]}
      >
        <DisplayText style={[styles.line, { color: theme.ink }]} testID="session-line">
          {line?.text ?? ""}
        </DisplayText>
      </Animated.View>

      {/* Seven marks rather than a bar. A bar measures how much is left, which
          turns a practice into a queue; marks just say where you are. */}
      <View style={styles.dots} pointerEvents="none">
        {lines.map((l, i) => (
          <View
            key={l.id}
            style={[
              styles.dot,
              {
                backgroundColor: theme.ink,
                opacity: i === index ? 0.9 : i < index ? 0.4 : 0.15,
              },
            ]}
          />
        ))}
      </View>

      <Pressable
        onPress={toggle}
        hitSlop={20}
        accessibilityRole="button"
        accessibilityState={{ selected: playing }}
        accessibilityLabel={playing ? "Pause" : "Play"}
        style={styles.control}
        testID="session-toggle"
      >
        <Ionicons name={playing ? "pause" : "play"} size={26} color={theme.accent} />
      </Pressable>
    </View>
  );
};

export default ListeningSession;

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  close: { position: "absolute", top: spacing.xxl, right: spacing.xl, padding: spacing.sm },
  lineWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  line: { ...type.affirmation, fontSize: 30, lineHeight: 44, textAlign: "center" },
  dots: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  dot: { width: 6, height: 6, borderRadius: 3 },
  control: { padding: spacing.md, marginBottom: spacing.xl },
});
