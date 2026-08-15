import Svg, { G, Path, Rect } from "react-native-svg";
import { useAppTheme } from "../contexts/ThemeContext.jsx";

/**
 * Line drawings for the profile tiles.
 *
 * Drawn as SVG rather than shipped as images for one reason that matters here:
 * the app has several themes and the stroke has to be the theme's ink on every
 * one of them. A PNG would need a copy per theme, or would sit wrong on all but
 * the one it was exported for.
 *
 * The house style is a single hairline stroke, no fills, and a few four-point
 * sparkles for air. Keep new pieces to that — the tiles read as a set only
 * because nothing in them is heavier than anything else.
 */
const Sparkle = ({ x, y, r = 4, stroke, opacity = 0.7 }) => (
  <Path
    d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}`}
    stroke={stroke}
    strokeWidth={1}
    fill="none"
    opacity={opacity}
  />
);

const ART = {
  /** Stacked cards, fanned — a set of themes to leaf through. */
  theme: (s) => (
    <G>
      <Rect x="16" y="30" width="42" height="54" rx="6" stroke={s} strokeWidth="1.2" fill="none"
        opacity="0.45" transform="rotate(-14 37 57)" />
      <Rect x="30" y="26" width="42" height="54" rx="6" stroke={s} strokeWidth="1.2" fill="none"
        opacity="0.7" transform="rotate(-5 51 53)" />
      <Rect x="46" y="22" width="42" height="54" rx="6" stroke={s} strokeWidth="1.3" fill="none" />
      <Path d="M56 40h22M56 50h16" stroke={s} strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
      <Sparkle x={100} y={26} stroke={s} />
      <Sparkle x={14} y={82} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A quill mid-stroke — writing your own. */
  myWords: (s) => (
    <G>
      <Path d="M78 20c-6 14-20 32-34 44-6 5-10 9-12 14" stroke={s} strokeWidth="1.3"
        strokeLinecap="round" fill="none" />
      <Path d="M78 20c-14 2-24 10-28 20 8 4 20 0 28-20Z" stroke={s} strokeWidth="1.2" fill="none" />
      <Path d="M24 86c10-4 22-4 32 0" stroke={s} strokeWidth="1.1" strokeLinecap="round"
        opacity="0.65" fill="none" />
      <Sparkle x={92} y={44} stroke={s} />
      <Sparkle x={20} y={30} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A heart, drawn in one line. */
  favorites: (s) => (
    <G>
      <Path
        d="M52 82c-16-11-30-22-30-37a15 15 0 0 1 30-6 15 15 0 0 1 30 6c0 15-14 26-30 37Z"
        stroke={s} strokeWidth="1.3" fill="none"
      />
      <Sparkle x={92} y={30} stroke={s} />
      <Sparkle x={18} y={70} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A cut crystal — the premium tile in the reference. */
  subscription: (s) => (
    <G>
      <Path d="M44 22h26l12 20-25 44-25-44Z" stroke={s} strokeWidth="1.3" fill="none" />
      <Path d="M32 42h50M44 22l13 64M70 22L57 86" stroke={s} strokeWidth="1.1" opacity="0.6"
        fill="none" />
      <Sparkle x={96} y={34} stroke={s} />
      <Sparkle x={20} y={64} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A bell, for reminders. */
  reminders: (s) => (
    <G>
      <Path d="M36 68c6-6 6-12 6-20a15 15 0 0 1 30 0c0 8 0 14 6 20Z" stroke={s} strokeWidth="1.3"
        fill="none" />
      <Path d="M50 74a7 7 0 0 0 14 0" stroke={s} strokeWidth="1.2" fill="none" />
      <Path d="M57 33v-7" stroke={s} strokeWidth="1.2" strokeLinecap="round" />
      <Sparkle x={92} y={38} stroke={s} />
      <Sparkle x={22} y={30} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** An hourglass, for what you've already seen. */
  history: (s) => (
    <G>
      <Path d="M36 22h42M36 86h42" stroke={s} strokeWidth="1.3" strokeLinecap="round" />
      <Path d="M40 22c0 16 17 24 17 32s-17 16-17 32M74 22c0 16-17 24-17 32s17 16 17 32"
        stroke={s} strokeWidth="1.3" fill="none" />
      <Path d="M47 74c6-4 14-4 20 0" stroke={s} strokeWidth="1.1" opacity="0.6" fill="none" />
      <Sparkle x={94} y={40} stroke={s} />
    </G>
  ),
};

const LineArt = ({ name, size = 104 }) => {
  const { theme } = useAppTheme();
  const draw = ART[name];
  if (!draw) return null;

  return (
    <Svg width={size} height={size} viewBox="0 0 114 104" fill="none">
      {draw(theme.ink)}
    </Svg>
  );
};

export default LineArt;
export const LINE_ART_NAMES = Object.keys(ART);
