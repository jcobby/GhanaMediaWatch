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
  /**
   * Fill the parent instead of being sized by the class.
   *
   * The animated wrapper has no dimensions of its own, so a `h-full` on the
   * block inside it resolves against a parent of zero height and the skeleton
   * renders as nothing. Callers that want a block the size of the box it sits
   * in — an image frame waiting for its picture — say so here rather than
   * discovering that the hard way.
   */
  fill?: boolean;
}

/**
 * Shimmering placeholder block. Every list's loading state is built from these
 * rather than a bare spinner, per the quality bar.
 *
 * The pulse uses an animated style (StyleSheet-shaped) because NativeWind
 * cannot drive a Reanimated shared value; the static box uses classes.
 */
export function Skeleton({ className, fill = false }: SkeletonProps) {
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
      style={fill ? [animatedStyle, { flex: 1 }] : animatedStyle}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className={cn('rounded-sm bg-hairline/[0.10]', fill && 'h-full w-full', className)} />
    </Animated.View>
  );
}
