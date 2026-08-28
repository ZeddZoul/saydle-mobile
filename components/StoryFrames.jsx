import { StyleSheet, View } from "react-native";
import ShareCard, { RATIOS } from "./ShareCard.jsx";

/**
 * The cards a video is made of, rendered where nobody sees them.
 *
 * view-shot captures a *mounted, laid-out* view — there is no way to render a
 * component straight to an image — so the frames have to exist in the tree.
 * Pushing them far off-screen keeps them real (measured, drawn, capturable)
 * while the sheet in front stays the only thing on screen.
 *
 * `opacity: 0` looks like the tidier trick and is the wrong one: iOS captures
 * the view's actual compositing, so a transparent card yields transparent
 * frames and the video comes out blank.
 *
 * Always the story ratio — the encoder aspect-fills, so anything else is
 * centre-cropped on the way in.
 */
const StoryFrames = ({ lines, refs, theme, width = 320 }) => (
  <View style={styles.offscreen} pointerEvents="none" testID="story-frames">
    {lines.map((line, i) => (
      <ShareCard
        key={line.id ?? i}
        ref={refs[i]}
        text={line.text}
        theme={theme}
        ratio={RATIOS.story}
        width={width}
        // Distinct from the sheet's preview card, which is on screen and
        // carries the default id — four views answering to "share-card" would
        // make every query for the preview ambiguous.
        testID={`story-frame-${i}`}
      />
    ))}
  </View>
);

export default StoryFrames;

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    // Far enough left that no device width reaches it, and it never
    // participates in the sheet's layout.
    left: -10_000,
    top: 0,
  },
});
