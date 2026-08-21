import { type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Pressable, type PressableProps } from './Pressable';
import { Text } from './Text';

export interface ChipProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected?: boolean;
  /** Solid dot before the label — the incident category hue. */
  dotColor?: string;
  leading?: ReactNode;
}

/** Tappable filter/selection token. */
export function Chip({
  label,
  selected = false,
  dotColor,
  leading,
  className,
  ...rest
}: ChipProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      className={cn(
        'h-9 flex-row items-center gap-2 rounded-pill border px-3.5',
        selected ? 'border-accent/70 bg-accent-wash' : 'border-hairline/[0.14] bg-glass/[0.08]',
        className,
      )}
      {...rest}
    >
      {dotColor ? (
        // Category hues are data, not theme tokens — the value arrives at
        // runtime from the category map, so an inline colour is unavoidable.
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} />
      ) : (
        leading
      )}
      <Text variant="body-sm" tone={selected ? 'accent' : 'secondary'} className="font-sans-medium">
        {label}
      </Text>
    </Pressable>
  );
}
