import { type ReactNode } from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { cn } from '@/lib/cn';
import { shadow } from '@/lib/theme';

export type GlassElevation = 'low' | 'mid' | 'high';

/**
 * `surface` — a frosted white panel on the light app ground.
 * `media`   — a dark frosted panel sitting on photography. Not "dark mode":
 *             it is the only thing legible over an arbitrary photo.
 */
export type GlassContext = 'surface' | 'media';

const INTENSITY: Record<GlassElevation, number> = { low: 26, mid: 46, high: 72 };

const TINT: Record<GlassContext, Record<GlassElevation, string>> = {
  surface: {
    low: 'bg-glass/70',
    mid: 'bg-glass/80',
    high: 'bg-glass/90',
  },
  media: {
    low: 'bg-glass-media/35',
    mid: 'bg-glass-media/50',
    high: 'bg-glass-media/65',
  },
};

const BORDER: Record<GlassContext, string> = {
  surface: 'border border-hairline/[0.08]',
  media: 'border border-hairline-media/[0.18]',
};

/** Opaque fallback used on Android, where blur is too costly for a video feed. */
const SOLID: Record<GlassContext, string> = {
  surface: 'bg-canvas-soft',
  media: 'bg-glass-media/85',
};

/** Which shadow each elevation casts. `low` rests, `high` floats. */
const SHADOW: Record<GlassContext, Record<GlassElevation, string>> = {
  surface: { low: shadow.sm, mid: shadow.md, high: shadow.lg },
  media: { low: shadow.onMedia, mid: shadow.onMedia, high: shadow.onMedia },
};

export interface GlassProps extends ViewProps {
  elevation?: GlassElevation;
  context?: GlassContext;
  bordered?: boolean;
  /** Set false for panels flush against a surface, where a shadow reads as dirt. */
  raised?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A translucent panel with real depth.
 *
 * The blur is an absolutely-positioned *background layer*, and `children` are
 * direct children of the styled container. That ordering is the whole point:
 * an earlier version nested children inside the BlurView, so any layout class
 * the caller passed (`flex-row`, `items-center`, padding) applied to a wrapper
 * the children were not in — segmented controls stacked vertically and pill
 * labels vanished. Keep children as siblings of the backdrop, never inside it.
 */
/**
 * Fill the parent.
 *
 * `StyleSheet.absoluteFillObject` was removed in React Native 0.86. The object
 * it returned is four properties, so it is written out rather than replaced
 * with `absoluteFill` — that one is a registered style id, and passing it where
 * a plain object is expected type-checks in some positions and not others.
 */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export function Glass({
  elevation = 'mid',
  context = 'surface',
  bordered = true,
  raised = true,
  className,
  children,
  style,
  ...rest
}: GlassProps) {
  return (
    <View
      className={cn('overflow-hidden', bordered && BORDER[context], className)}
      // boxShadow has no NativeWind utility that works across both platforms,
      // so elevation is the one style this primitive sets directly.
      style={[raised ? { boxShadow: SHADOW[context][elevation] } : null, style]}
      {...rest}
    >
      {Platform.OS === 'android' ? (
        // Android's blur costs enough frames to be visible in a scrolling feed;
        // a near-opaque fill reads almost identically and stays smooth.
        <View className={cn('absolute', SOLID[context])} style={FILL} pointerEvents="none" />
      ) : (
        <BlurView
          intensity={INTENSITY[elevation]}
          tint={context === 'media' ? 'dark' : 'light'}
          style={FILL}
          pointerEvents="none"
        >
          <View className={cn('flex-1', TINT[context][elevation])} />
        </BlurView>
      )}
      {children}
    </View>
  );
}
