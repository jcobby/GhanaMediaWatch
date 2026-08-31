import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from '@/lib/cn';
import { accentGradient, shadow, useColors } from '@/lib/theme';
import { Pressable, type PressableProps } from './Pressable';
import { Text, type TextTone } from './Text';

export type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 rounded-pill',
  md: 'h-12 px-5 rounded-pill',
  lg: 'h-14 px-7 rounded-pill',
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
    <View className="flex-row items-center justify-center gap-2">
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
