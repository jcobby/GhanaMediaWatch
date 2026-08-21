import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text, type TextTone } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'live';

const CONTAINER: Record<BadgeTone, string> = {
  neutral: 'bg-canvas-raise border-hairline/[0.10]',
  accent: 'bg-accent-wash border-accent/60',
  success: 'bg-success-wash border-success/50',
  warning: 'bg-warning-wash border-warning/50',
  danger: 'bg-danger-wash border-danger/50',
  info: 'bg-info-wash border-info/50',
  live: 'bg-live border-live',
};

const LABEL: Record<BadgeTone, TextTone> = {
  neutral: 'secondary',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  live: 'primary',
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  className?: string;
}

/** Static status marker. Not interactive — use Chip when it can be tapped. */
export function Badge({ label, tone = 'neutral', className }: BadgeProps) {
  return (
    <View
      accessibilityRole="text"
      className={cn('self-start rounded-pill border px-2.5 py-1', CONTAINER[tone], className)}
    >
      <Text variant="caption" tone={LABEL[tone]} className="font-sans-semibold">
        {label}
      </Text>
    </View>
  );
}
