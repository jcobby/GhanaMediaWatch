import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Chip, Glass, Pressable, Text } from '@/components/ui';
import { ORGANISATIONS } from '@/api/dawuroData';
import { categoryColor, useColors } from '@/lib/theme';
import {
  SUBSCRIPTION_PLANS,
  downloadCharge,
  formatCedis,
  isUnlimited,
  type OrganisationAccount,
} from '@/types/dawuro';

const STATUS_TONE: Record<
  OrganisationAccount['subscriptionStatus'],
  'success' | 'accent' | 'warning' | 'danger'
> = {
  active: 'success',
  trialing: 'accent',
  past_due: 'warning',
  cancelled: 'danger',
};

/**
 * Live organisation accounts.
 *
 * An operator's view of who is on the platform and how they are using it.
 * Allowance consumption is shown as a bar rather than a number because the
 * useful signal is *proportion*: an account at 95% is about to start paying
 * overage, and one at 4% may be about to churn — neither reads from a raw count.
 */
export function ManageOrganisationsScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<OrganisationAccount['subscriptionStatus'] | null>(null);

  const visible = filter
    ? ORGANISATIONS.filter((b) => b.subscriptionStatus === filter)
    : ORGANISATIONS;

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-lg">{t('platform.manageOrganisations')}</Text>
            <Text variant="caption" tone="muted">
              {t('platform.activeAccounts', { count: ORGANISATIONS.length })}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip
            label={t('common.all')}
            selected={filter === null}
            onPress={() => setFilter(null)}
          />
          {(['active', 'trialing', 'past_due'] as const).map((s) => (
            <Chip
              key={s}
              label={t(`platform.subscription.${s}`)}
              selected={filter === s}
              onPress={() => setFilter(filter === s ? null : s)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerClassName="gap-2 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {visible.map((organisation) => {
          const plan = SUBSCRIPTION_PLANS[organisation.tier];
          // No allowance exists to exceed; this now reads spend, not quota.
          const spent = downloadCharge(plan) * organisation.reportsUsedThisPeriod;
          const uncapped = isUnlimited(plan);

          return (
            <Glass key={organisation.id} elevation="low" className="gap-3 rounded-lg p-4">
              <View className="flex-row items-start gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise">
                  <Ionicons name="business" size={17} color={c.textMuted} />
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text variant="body" className="font-sans-semibold" numberOfLines={1}>
                      {organisation.name}
                    </Text>
                    {organisation.verified ? (
                      <Ionicons name="checkmark-circle" size={13} color={c.info} />
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {t(`sector.${organisation.sector}`)} ·{' '}
                    {t('platform.seatsUsed', { count: organisation.seatsUsed, total: plan.seats })}
                  </Text>
                </View>
                <Badge
                  label={t(`platform.subscription.${organisation.subscriptionStatus}`)}
                  tone={STATUS_TONE[organisation.subscriptionStatus]}
                />
              </View>

              {/* Downloads taken, and what they have cost */}
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text variant="caption" tone="muted">
                    {t('platform.downloadsTaken', {
                      count: organisation.reportsUsedThisPeriod,
                    })}
                  </Text>
                  <Text variant="caption" tone="muted" className="font-sans-semibold">
                    {/* What this organisation has actually run up this period —
                        the number an operator chasing revenue wants. */}
                    {uncapped
                      ? t('organisation.unlimitedDownloads')
                      : formatCedis(spent, { compact: true })}
                  </Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-pill bg-canvas-raise">
                  <View
                    className={
                      uncapped ? 'h-full rounded-pill bg-warning' : 'h-full rounded-pill bg-accent'
                    }
                    style={{
                      width: `${Math.min(100, organisation.reportsUsedThisPeriod * 4)}%`,
                    }}
                  />
                </View>
              </View>

              <View className="flex-row flex-wrap gap-1.5 border-t border-hairline/[0.07] pt-3">
                {organisation.interests.map((c) => (
                  <View
                    key={c}
                    className="flex-row items-center gap-1.5 rounded-pill bg-canvas-raise px-2.5 py-1"
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: categoryColor[c],
                      }}
                    />
                    <Text variant="caption" tone="secondary">
                      {t(`category.${c}`)}
                    </Text>
                  </View>
                ))}
              </View>
            </Glass>
          );
        })}
      </ScrollView>
    </View>
  );
}
