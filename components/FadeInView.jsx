import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

/**
 * Fades and lifts its children into place. Give siblings increasing `delay`
 * values to stagger them — that gentle cascade is what makes a static panel feel
 * alive without being busy.
 */
const FadeInView = ({ delay = 0, from = 16, duration = 480, style, children, ...props }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }),
            },
          ],
        },
      ]}
      {...props}
    >
      {children}
    </Animated.View>
  );
};

export default FadeInView;
