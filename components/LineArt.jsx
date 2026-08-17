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
      {/* A deck stepped to the lower-left, occluded by omission. The last
          version drew every card in full, and because line art has no fill,
          the back cards' edges showed straight through the front card's face —
          the clutter was overlap, not detail. Real line art never draws the
          hidden part: each back card here is one open path covering only what
          actually peeks out, so nothing ever crosses the scene. */}
      <Path
        d="M36 36h-3a7 7 0 0 0-7 7v42a7 7 0 0 0 7 7h24a7 7 0 0 0 7-7"
        stroke={s}
        strokeWidth="1.1"
        opacity="0.35"
        fill="none"
      />
      <Path
        d="M46 29h-3a7 7 0 0 0-7 7v42a7 7 0 0 0 7 7h24a7 7 0 0 0 7-7"
        stroke={s}
        strokeWidth="1.2"
        opacity="0.6"
        fill="none"
      />
      {/* Only the front card carries the scene — sun and two hills, ending
          exactly on the card's edges — because a theme is a backdrop. */}
      <Rect
        x="46"
        y="22"
        width="38"
        height="56"
        rx="8"
        stroke={s}
        strokeWidth="1.4"
        fill="none"
      />
      <Path
        d="M74 31.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9Z"
        stroke={s}
        strokeWidth="1.2"
        fill="none"
      />
      <Path d="M46 64c8-14 16-14 22 0" stroke={s} strokeWidth="1.2" fill="none" />
      <Path d="M62 64c7-10 15-10 22 0" stroke={s} strokeWidth="1.1" opacity="0.7" fill="none" />
      <Sparkle x={96} y={40} stroke={s} />
      <Sparkle x={18} y={26} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A quill mid-stroke — writing your own. */
  myWords: (s) => (
    <G>
      {/* The feather: a leaf-shaped vane with a spine, rather than a squiggle.
          Read at 104px the old mark was unidentifiable — this is a quill. */}
      <Path
        d="M84 18c-4 20-14 34-27 43l-9 6-6-6 5-9C56 39 69 26 84 18Z"
        stroke={s}
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      {/* The spine, and the barbs that make it read as a feather at a glance. */}
      <Path d="M84 18 47 61" stroke={s} strokeWidth="1.1" opacity="0.55" />
      <Path
        d="M76 25l-6 1M69 32l-7 1M62 40l-7 1M55 48l-6 1"
        stroke={s}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Shaft down to a nib, with the split every dip pen has. */}
      <Path d="M42 67 31 79" stroke={s} strokeWidth="1.3" strokeLinecap="round" />
      <Path d="M31 79l-4 5 6-2Z" stroke={s} strokeWidth="1.1" fill="none" />
      {/* The stroke it just laid down. */}
      <Path
        d="M22 90c9-5 22-5 34-1"
        stroke={s}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      <Sparkle x={94} y={44} stroke={s} />
      <Sparkle x={20} y={28} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A heart, drawn in one line. */
  favorites: (s) => (
    <G>
      {/* Two lobes meeting in a cleft, then curving to a point. The old path
          was one shallow arch, which reads as a bowl before it reads as a
          heart — the cleft is what the eye actually looks for. */}
      <Path
        d="M57 84C40 72 24 60 24 45a16 16 0 0 1 33-7 16 16 0 0 1 33 7c0 15-16 27-33 39Z"
        stroke={s}
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      {/* A highlight along the left lobe — the same trick a drawn heart uses
          to stop it looking like a flat outline. */}
      <Path
        d="M35 44a10 10 0 0 1 9-9"
        stroke={s}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.5"
        fill="none"
      />
      <Sparkle x={94} y={30} stroke={s} />
      <Sparkle x={18} y={72} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A cut crystal — the premium tile in the reference. */
  subscription: (s) => (
    <G>
      {/* A brilliant cut: table, crown facets, girdle, then facets converging
          on a point. The old mark was a flat hexagon with three lines through
          it, which reads as a kite. A gem is legible because of the girdle —
          the horizontal break between the flat top and the tapering bottom. */}
      <Path
        d="M40 34h34l10 14-27 40-27-40Z"
        stroke={s}
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Girdle — the widest line, and the one that makes it a gem. */}
      <Path d="M30 48h54" stroke={s} strokeWidth="1.3" />
      {/* Crown: the table, and the facets falling away from it. */}
      <Path
        d="M40 34l-10 14M74 34l10 14M48 48l-8-14M66 48l8-14"
        stroke={s}
        strokeWidth="1"
        opacity="0.55"
        fill="none"
      />
      {/* Pavilion: facets converging on the culet. */}
      <Path
        d="M30 48l27 40M84 48L57 88M48 48l9 40M66 48l-9 40"
        stroke={s}
        strokeWidth="1"
        opacity="0.5"
        fill="none"
      />
      <Sparkle x={96} y={32} stroke={s} />
      <Sparkle x={18} y={68} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A bell, for reminders. */
  reminders: (s) => (
    <G>
      <Path
        d="M36 68c6-6 6-12 6-20a15 15 0 0 1 30 0c0 8 0 14 6 20Z"
        stroke={s}
        strokeWidth="1.3"
        fill="none"
      />
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
      <Path
        d="M40 22c0 16 17 24 17 32s-17 16-17 32M74 22c0 16-17 24-17 32s17 16 17 32"
        stroke={s}
        strokeWidth="1.3"
        fill="none"
      />
      <Path d="M47 74c6-4 14-4 20 0" stroke={s} strokeWidth="1.1" opacity="0.6" fill="none" />
      <Sparkle x={94} y={40} stroke={s} />
    </G>
  ),
  /** The heart, dotted — drawn but not yet filled in. One small one arriving. */
  favoritesEmpty: (s) => (
    <G>
      <Path
        d="M57 84C40 72 24 60 24 45a16 16 0 0 1 33-7 16 16 0 0 1 33 7c0 15-16 27-33 39Z"
        stroke={s}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray="3 5.5"
        fill="none"
      />
      {/* The first heart on its way in — the same shape, small and solid-lined,
          so the empty state promises rather than just gapes. Stroke width is
          compensated for the scale, since strokes scale with the group. */}
      <G transform="translate(74 10) scale(0.24)">
        <Path
          d="M57 84C40 72 24 60 24 45a16 16 0 0 1 33-7 16 16 0 0 1 33 7c0 15-16 27-33 39Z"
          stroke={s}
          strokeWidth="4.8"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
      <Sparkle x={20} y={28} r={3} stroke={s} opacity={0.5} />
      <Sparkle x={96} y={52} r={3.5} stroke={s} opacity={0.6} />
    </G>
  ),

  /** The quill at the ready, above a line not yet written. */
  wordsEmpty: (s) => (
    <G>
      <Path
        d="M84 18c-4 20-14 34-27 43l-9 6-6-6 5-9C56 39 69 26 84 18Z"
        stroke={s}
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M84 18 47 61" stroke={s} strokeWidth="1.1" opacity="0.55" />
      <Path
        d="M76 25l-6 1M69 32l-7 1M62 40l-7 1M55 48l-6 1"
        stroke={s}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.45"
      />
      <Path d="M42 67 31 79" stroke={s} strokeWidth="1.3" strokeLinecap="round" />
      <Path d="M31 79l-4 5 6-2Z" stroke={s} strokeWidth="1.1" fill="none" />
      {/* Dashed where myWords has the written stroke: the same quill, nothing
          laid down yet. The dashes are the invitation. */}
      <Path
        d="M22 90h40"
        stroke={s}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeDasharray="2.5 5"
        opacity="0.6"
      />
      <Sparkle x={94} y={44} stroke={s} />
      <Sparkle x={20} y={28} r={3} stroke={s} opacity={0.5} />
    </G>
  ),

  /** A page mid-write, for a feed still being prepared. */
  feedWriting: (s) => (
    <G>
      <Rect
        x="34"
        y="18"
        width="46"
        height="68"
        rx="8"
        stroke={s}
        strokeWidth="1.4"
        fill="none"
      />
      <Path
        d="M44 36h26M44 46h26"
        stroke={s}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <Path d="M44 56h14" stroke={s} strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
      {/* The line being written trails off into beads, and the one after it is
          only dashes — the page is arriving, not missing. */}
      <Path
        d="M62 56h11"
        stroke={s}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="0.2 5"
        opacity="0.6"
      />
      <Path
        d="M44 66h26"
        stroke={s}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeDasharray="2.5 5"
        opacity="0.4"
      />
      <Sparkle x={92} y={30} stroke={s} />
      <Sparkle x={22} y={72} r={3} stroke={s} opacity={0.5} />
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
