import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Text } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useColors } from '@/lib/theme';

/**
 * Whose organisation this is, on every organisation screen.
 *
 * Present on all four tabs rather than on a home screen alone, because an
 * account can belong to more than one organisation and every action underneath
 * spends that organisation's money, answers under its name, or dispatches its
 * people. A screen that does not say which organisation it is acting as is a
 * screen where the wrong one can be acted as.
 *
 * The verification badge is the platform's word, not the organisation's own
 * claim about itself — an unverified organisation may not be credited publicly,
 * and showing it as verified would put its name on somebody else's footage.
 */
export function OrgHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const c = useColors();
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.profile?.role);
  const verified = useAuthStore((s) => s.profile?.orgVerified);

  return (
    <View className="gap-2 px-4 pb-4">
      <View className="flex-row items-center gap-2">
        <Text variant="title-lg" numberOfLines={1} className="shrink">
          {title}
        </Text>
        {verified ? (
          <Ionicons name="checkmark-circle" size={17} color={c.info} />
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        <Text variant="body-sm" tone="muted">
          {subtitle}
        </Text>
        {/* The role decides what the service will let this person do. Saying it
            here is cheaper than a 403 after a tap that spends money. */}
        {role ? <Badge label={t(`org.role.${role}`)} tone="neutral" /> : null}
      </View>
    </View>
  );
}
