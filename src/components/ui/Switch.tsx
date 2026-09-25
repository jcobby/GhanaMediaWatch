import { Switch as RNSwitch, View } from 'react-native';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { hapticSelect } from '@/lib/haptics';
import { Text } from './Text';

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /**
   * `lg` matches the settings list's row size.
   *
   * The settings screen stacks these directly above `SettingRow`s, and at the
   * default size the two read as two different lists — a 15px label under an
   * 18px one, in the same panel. The capture screens keep the default: there a
   * switch sits among form fields rather than among settings rows.
   */
  size?: 'md' | 'lg';
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
  size = 'md',
  className,
}: SwitchRowProps) {
  const c = useColors();
  const large = size === 'lg';
  return (
    <View
      // Padding through `style` on the large variant: it has to line up with
      // `SettingRow`, which measures itself the same way for the same reason —
      // a spacing class this project has not used before is absent from the
      // compiled stylesheet until Metro restarts, silently.
      style={large ? { paddingVertical: 18, minHeight: 76 } : undefined}
      className={cn(
        large ? 'flex-row items-center gap-4' : 'flex-row items-center gap-4 py-3',
        disabled && 'opacity-40',
        className,
      )}
    >
      <View className="flex-1 gap-0.5">
        <Text variant={large ? 'title-md' : 'body'} className={large ? '' : 'font-sans-medium'}>
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
        trackColor={{ false: c.canvasRaise, true: c.accent }}
        thumbColor={c.textPrimary}
        ios_backgroundColor={c.canvasRaise}
      />
    </View>
  );
}
