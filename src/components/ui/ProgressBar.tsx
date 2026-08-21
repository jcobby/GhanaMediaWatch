import { View } from 'react-native';
import { cn } from '@/lib/cn';

interface ProgressBarProps {
  /** 0..1. Values outside the range are clamped. */
  progress: number;
  className?: string;
  /** Indeterminate bars show a static half-fill; callers pair them with a label. */
  indeterminate?: boolean;
  accessibilityLabel: string;
}

export function ProgressBar({
  progress,
  className,
  indeterminate = false,
  accessibilityLabel,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        indeterminate ? undefined : { min: 0, max: 100, now: Math.round(clamped * 100) }
      }
      className={cn('h-1 w-full overflow-hidden rounded-pill bg-canvas-soft', className)}
    >
      {/* Width is a runtime percentage; NativeWind's static width scale can't
          express an arbitrary fraction, so this one value is inline. */}
      <View
        className="h-full rounded-pill bg-accent"
        style={{ width: `${(indeterminate ? 0.5 : clamped) * 100}%` }}
      />
    </View>
  );
}
