import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { useRole } from './useRole';
import type { OrgCapability } from './permissions';

interface RequireRoleProps {
  capability: OrgCapability;
  children: ReactNode;
  /** Render nothing rather than an explanation. For inline controls. */
  silent?: boolean;
}

/**
 * Hides UI the current role cannot use.
 *
 * This is presentation, not security. Anyone can call the API directly, so the
 * backend must enforce the same rule — see API_CONTRACT.md §8. Treating this
 * component as the authorisation boundary would be a serious mistake.
 */
export function RequireRole({ capability, children, silent = false }: RequireRoleProps) {
  const c = useColors();
  const { can } = useRole();
  const { t } = useTranslation();

  if (can(capability)) return <>{children}</>;
  if (silent) return null;

  return (
    <View className="items-center gap-2 rounded-lg bg-canvas-raise p-5">
      <Ionicons name="lock-closed-outline" size={20} color={c.textMuted} />
      <Text variant="body-sm" tone="muted" className="text-center">
        {t('org.noPermission')}
      </Text>
    </View>
  );
}
