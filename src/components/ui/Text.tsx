import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/lib/cn';

export type TextVariant =
  | 'display-xl'
  | 'display-lg'
  | 'display-md'
  | 'title-lg'
  | 'title-md'
  | 'title-sm'
  | 'body-lg'
  | 'body'
  | 'body-sm'
  | 'label'
  | 'caption';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const VARIANT_CLASS: Record<TextVariant, string> = {
  'display-xl': 'text-display-xl font-display',
  'display-lg': 'text-display-lg font-display',
  'display-md': 'text-display-md font-sans-bold',
  'title-lg': 'text-title-lg font-sans-bold',
  'title-md': 'text-title-md font-sans-semibold',
  'title-sm': 'text-title-sm font-sans-semibold',
  'body-lg': 'text-body-lg font-sans',
  body: 'text-body font-sans',
  'body-sm': 'text-body-sm font-sans',
  label: 'text-label font-sans-semibold uppercase',
  caption: 'text-caption font-sans-medium',
};

const TONE_CLASS: Record<TextTone, string> = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-text-muted',
  faint: 'text-text-faint',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  className?: string;
  /** Adds a soft shadow so text stays readable directly over video frames. */
  onMedia?: boolean;
}

/**
 * The single text primitive. Components never reach for RN's <Text> directly so
 * the type scale stays closed and font scaling behaves consistently.
 *
 * `onMedia` exists because overlay text sits on unpredictable footage — a scrim
 * handles most of it, but a bright frame still needs the glyphs themselves to
 * carry a shadow. textShadow has no NativeWind utility, hence the inline style.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  className,
  onMedia = false,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      className={cn(
        VARIANT_CLASS[variant],
        // Over media, tone is overridden: the light palette's dark text is
        // unreadable on photography, so overlays are always white.
        onMedia
          ? tone === 'muted' || tone === 'faint'
            ? 'text-white/70'
            : 'text-white'
          : TONE_CLASS[tone],
        className,
      )}
      style={[
        onMedia
          ? {
              textShadowColor: 'rgba(0,0,0,0.55)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
            }
          : null,
        style,
      ]}
      {...rest}
    />
  );
}
