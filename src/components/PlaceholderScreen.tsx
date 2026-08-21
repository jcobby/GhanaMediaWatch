import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Text } from '@/components/ui';

interface PlaceholderScreenProps {
  title: string;
  /** Which build phase delivers this screen. Removed as each lands. */
  phase: string;
}

/** Scaffolding marker for routes that exist but are not yet implemented. */
export function PlaceholderScreen({ title, phase }: PlaceholderScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center gap-3 bg-canvas px-8"
      style={{ paddingTop: insets.top }}
    >
      <Text variant="display-md">{title}</Text>
      <Badge label={phase} tone="accent" />
      <Text variant="body" tone="muted" className="text-center">
        Route is wired and typed. The screen lands in {phase}.
      </Text>
    </View>
  );
}
