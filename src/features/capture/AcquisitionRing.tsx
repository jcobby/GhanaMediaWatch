import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { acquisitionProgress } from './gpsGate';

interface AcquisitionRingProps {
  accuracyM: number | null;
}

/**
 * The acquisition indicator.
 *
 * The pulse tightens as the fix improves, so the animation itself carries the
 * signal rather than merely decorating the number — a reporter glancing at the
 * screen can tell whether it is converging without reading the metres.
 *
 * Reanimated styles cannot be expressed as NativeWind classes, so the animated
 * transform is an inline style; everything static stays as classes.
 */
export function AcquisitionRing({ accuracyM }: AcquisitionRingProps) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  const progress = acquisitionProgress(accuracyM);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    // A tighter fix pulses less: the ring visibly settles as it converges.
    const amplitude = 1 + 0.4 * (1 - progress);
    pulse.value = withRepeat(
      withTiming(amplitude, { duration: 1400, easing: Easing.out(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion, progress]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View
      className="items-center justify-center"
      accessibilityRole="progressbar"
      accessibilityLabel={
        accuracyM === null
          ? 'Acquiring location'
          : `Location accuracy ${Math.round(accuracyM)} metres`
      }
      // Screen readers should hear the accuracy change, not just see it.
      accessibilityLiveRegion="polite"
    >
      {!reducedMotion ? (
        <Animated.View
          style={ringStyle}
          className="absolute h-48 w-48 rounded-pill border border-accent/25"
        />
      ) : null}
      <View className="h-36 w-36 items-center justify-center rounded-pill border-2 border-accent/50 bg-accent-wash">
        <Text variant="display-md" className="font-display">
          {accuracyM === null ? '—' : Math.round(accuracyM)}
        </Text>
        <Text variant="caption" tone="muted" className="uppercase">
          metres
        </Text>
      </View>
    </View>
  );
}
