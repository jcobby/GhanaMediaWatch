import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

export type ScrimPlacement = 'top' | 'bottom';

interface ScrimProps {
  placement?: ScrimPlacement;
  /** Fraction of the parent's height the scrim covers. */
  height?: number;
  /** Peak opacity at the closed end of the gradient. */
  intensity?: number;
}

/**
 * Gradient overlay for text sitting on top of media.
 *
 * The design system forbids flat opacity blocks over footage — a linear ramp
 * keeps captions legible over bright frames without greying out the image.
 *
 * StyleSheet.absoluteFill is used rather than NativeWind here because
 * LinearGradient's `colors` prop is not a style, and its fill must be an
 * absolute overlay whose height is a runtime percentage. NativeWind cannot
 * express the gradient stops at all.
 */
export function Scrim({ placement = 'bottom', height = 0.45, intensity = 0.85 }: ScrimProps) {
  const transparent = 'rgba(0,0,0,0)';
  const solid = `rgba(0,0,0,${intensity})`;

  return (
    <LinearGradient
      pointerEvents="none"
      colors={placement === 'bottom' ? [transparent, solid] : [solid, transparent]}
      locations={[0, 1]}
      style={[
        StyleSheet.absoluteFill,
        placement === 'bottom'
          ? { top: `${(1 - height) * 100}%` }
          : { bottom: `${(1 - height) * 100}%` },
      ]}
    />
  );
}
