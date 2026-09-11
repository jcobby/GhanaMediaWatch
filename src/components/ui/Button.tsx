import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from '@/lib/cn';
import { accentGradient, shadow, useColors } from '@/lib/theme';
import { Pressable, type PressableProps } from './Pressable';
import { Text, type TextTone } from './Text';

export type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Height and shape, on the element that clips.
 *
 * Horizontal padding is deliberately *not* here. The primary variant clips a
 * gradient to this box, and padding on a clipping container insets its child —
 * so the gradient stopped short of the edges and the page showed through as a
 * white gutter, leaving a purple rectangle floating inside a white pill.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-10 rounded-pill',
  md: 'h-12 rounded-pill',
  lg: 'h-14 rounded-pill',
};

/** Applied to the fill, so it reaches the edge and the label still breathes. */
const PADDING: Record<ButtonSize, string> = {
  sm: 'px-4',
  md: 'px-5',
  lg: 'px-7',
};

const LABEL_TONE: Record<ButtonVariant, TextTone> = {
  primary: 'primary',
  glass: 'primary',
  ghost: 'secondary',
  danger: 'danger',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leading,
  trailing,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const c = useColors();
  const isDisabled = disabled || loading;

  const content = (
    <View className={cn('flex-row items-center justify-center gap-2', PADDING[size])}>
      {loading ? <ActivityIndicator size="small" color={c.textPrimary} /> : leading}
      <Text
        variant={size === 'lg' ? 'title-sm' : 'body'}
        tone={LABEL_TONE[variant]}
        className="font-sans-semibold"
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing}
    </View>
  );

  // The primary action is the one place the signature gradient appears as a
  // fill. LinearGradient takes colours as a prop, not a style, so it cannot be
  // expressed as a className — it wraps the pressable rather than replacing it.
  if (variant === 'primary') {
    return (
      <Pressable
        disabled={isDisabled}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!isDisabled, busy: loading }}
        className={cn('overflow-hidden', SIZE[size], fullWidth && 'w-full', className)}
        // The primary action is the only element that casts an accent-tinted
        // shadow, which is what makes it read as the one thing to press.
        style={{ boxShadow: '0px 4px 14px rgba(91, 61, 245, 0.32)' }}
        {...rest}
      >
        <LinearGradient
          colors={[...accentGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          // Fills the pill edge to edge; the label's own padding keeps it clear
          // of the curve.
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const surface =
    variant === 'glass'
      ? 'bg-canvas-soft border border-hairline/[0.10]'
      : variant === 'danger'
        ? 'bg-danger-wash border border-danger/30'
        : 'bg-transparent';

  return (
    <Pressable
      disabled={isDisabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      className={cn(
        'flex-row items-center justify-center',
        surface,
        SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      style={variant === 'glass' ? { boxShadow: shadow.sm } : undefined}
      {...rest}
    >
      {content}
    </Pressable>
  );
}
