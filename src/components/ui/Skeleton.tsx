import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface SkeletonProps {
  className?: string;
}

/**
 * Shimmering placeholder block. Every list's loading state is built from these
 * rather than a bare spinner, per the quality bar.
 *
 * The pulse uses an animated style (StyleSheet-shaped) because NativeWind
 * cannot drive a Reanimated shared value; the static box uses classes.
 */
export function Skeleton({ className }: SkeletonProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={animatedStyle}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className={cn('rounded-sm bg-hairline/[0.10]', className)} />
    </Animated.View>
  );
}
