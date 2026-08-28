import { Text } from "react-native";
import { fonts, colors } from "../theme/tokens.js";

/**
 * Text set in Fraunces, the serif display face. Use it for anything that should
 * read as "voice" — affirmations, screen titles, section headers — and leave
 * body copy and UI labels in the system sans (plain <Text> / CustomText).
 */
const WEIGHTS = {
  regular: fonts.displayRegular,
  semibold: fonts.display,
  bold: fonts.displayBold,
  italic: fonts.displayItalic,
};

const DisplayText = ({ weight = "semibold", style, ...props }) => (
  <Text
    style={[{ fontFamily: WEIGHTS[weight] ?? fonts.display, color: colors.ink }, style]}
    {...props}
  />
);

export default DisplayText;
