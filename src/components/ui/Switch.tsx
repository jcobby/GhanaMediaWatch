import { Switch as RNSwitch, View } from 'react-native';
import { cn } from '@/lib/cn';
import { colors } from '@/lib/theme';
import { hapticSelect } from '@/lib/haptics';
import { Text } from './Text';

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Labelled toggle row — settings, display flags, anonymity.
 *
 * RN's Switch has no NativeWind surface for its track/thumb colours, so those
 * are passed as literal token values. They mirror --color-accent.
 */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  className,
}: SwitchRowProps) {
  return (
    <View className={cn('flex-row items-center gap-4 py-3', disabled && 'opacity-40', className)}>
      <View className="flex-1 gap-0.5">
        <Text variant="body" className="font-sans-medium">
          {label}
        </Text>
        {description ? (
          <Text variant="body-sm" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          hapticSelect();
          onValueChange(next);
        }}
        accessibilityLabel={label}
        accessibilityHint={description}
        trackColor={{ false: colors.canvasRaise, true: colors.accent }}
        thumbColor={colors.textPrimary}
        ios_backgroundColor={colors.canvasRaise}
      />
    </View>
  );
}
