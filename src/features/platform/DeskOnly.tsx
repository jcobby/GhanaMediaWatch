import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Glass, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';

/**
 * An action that deliberately does not exist on the phone.
 *
 * The platform tier was built twice — once here and once in the web console —
 * with nothing saying which was authoritative. Two consoles that can both
 * approve an institution and both release money is not redundancy, it is two
 * answers to "has this been done".
 *
 * The split is by consequence, not by convenience. Things that are
 * time-critical and reversible — routing a report to the right body — belong
 * wherever the operator is. Things that are irreversible and evidentiary —
 * granting a body access to citizens' footage, moving money — belong where the
 * evidence can actually be read.
 *
 * Shown rather than hidden. An operator who opens the approvals queue on a
 * phone and finds no buttons will assume the app is broken; told plainly, they
 * know the queue is real, the work is waiting, and where it gets done.
 */
export function DeskOnly({ reason }: { reason: string }) {
  const c = useColors();
  const { t } = useTranslation();

  return (
    <Glass elevation="low" className="gap-2 rounded-lg p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="desktop-outline" size={15} color={c.accent} />
        <Text variant="title-sm">{t('deskOnly.title')}</Text>
      </View>
      <Text variant="body-sm" tone="muted" style={{ lineHeight: 20 }}>
        {reason}
      </Text>
    </Glass>
  );
}
