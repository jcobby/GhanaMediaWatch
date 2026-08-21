import { forwardRef } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { cn } from '@/lib/cn';
import { MIN_TAP_TARGET } from '@/lib/constants';
import { hapticPress } from '@/lib/haptics';

export interface PressableProps extends Omit<RNPressableProps, 'style'> {
  className?: string;
  /**
   * A static style, for the handful of properties NativeWind cannot express
   * across both platforms — `boxShadow` above all. Deliberately not RN's
   * function form: that would reintroduce the pressed-state styling this
   * primitive exists to standardise.
   */
  style?: StyleProp<ViewStyle>;
  /** Fire a light haptic on press. Default true — the quality bar wants it on
   *  every primary action; pass false for high-frequency taps like feed scrub. */
  haptic?: boolean;
}

/**
 * Base pressable used by every interactive primitive.
 *
 * Guarantees the three things the quality bar demands of every touchable:
 * a >=44pt hit target (hitSlop expands the touch area without affecting
 * layout, so small icon buttons still clear the minimum), a visible pressed
 * state via NativeWind's `active:` variant, and haptic feedback.
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { className, haptic = true, onPress, disabled, accessibilityRole = 'button', style, ...rest },
  ref,
) {
  return (
    <RNPressable
      ref={ref}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={Math.round(MIN_TAP_TARGET / 4)}
      onPress={(event) => {
        if (haptic) hapticPress();
        onPress?.(event);
      }}
      className={cn('active:opacity-60', disabled && 'opacity-35', className)}
      style={style}
      {...rest}
    />
  );
});
