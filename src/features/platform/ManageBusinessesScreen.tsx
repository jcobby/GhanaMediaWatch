import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Chip, Glass, Pressable, Text } from '@/components/ui';
import { BUSINESSES } from '@/api/dawuroData';
import { categoryColor, colors } from '@/lib/theme';
import { SUBSCRIPTION_PLANS, formatCedis, type BusinessAccount } from '@/types/dawuro';

const STATUS_TONE: Record<
  BusinessAccount['subscriptionStatus'],
  'success' | 'accent' | 'warning' | 'danger'
> = {
  active: 'success',
  trialing: 'accent',
  past_due: 'warning',
  cancelled: 'danger',
};

/**
 * Live business accounts.
 *
 * An operator's view of who is on the platform and how they are using it.
 * Allowance consumption is shown as a bar rather than a number because the
 * useful signal is *proportion*: an account at 95% is about to start paying
 * overage, and one at 4% may be about to churn — neither reads from a raw count.
 */
export function ManageBusinessesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<BusinessAccount['subscriptionStatus'] | null>(null);

  const visible = filter ? BUSINESSES.filter((b) => b.subscriptionStatus === filter) : BUSINESSES;

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-lg">{t('platform.manageBusinesses')}</Text>
            <Text variant="caption" tone="muted">
              {t('platform.activeAccounts', { count: BUSINESSES.length })}
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
        {visible.map((business) => {
          const plan = SUBSCRIPTION_PLANS[business.tier];
          const usage = Math.min(1, business.reportsUsedThisPeriod / plan.includedReports);
          const overAllowance = business.reportsUsedThisPeriod > plan.includedReports;

          return (
            <Glass key={business.id} elevation="low" className="gap-3 rounded-lg p-4">
              <View className="flex-row items-start gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise">
                  <Ionicons name="business" size={17} color={colors.textMuted} />
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text variant="body" className="font-sans-semibold" numberOfLines={1}>
                      {business.name}
                    </Text>
                    {business.verified ? (
                      <Ionicons name="checkmark-circle" size={13} color={colors.info} />
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {t(`sector.${business.sector}`)} ·{' '}
                    {t('platform.seatsUsed', { count: business.seatsUsed, total: plan.seats })}
                  </Text>
                </View>
                <Badge
                  label={t(`platform.subscription.${business.subscriptionStatus}`)}
                  tone={STATUS_TONE[business.subscriptionStatus]}
                />
              </View>

              {/* Allowance consumption */}
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text variant="caption" tone="muted">
                    {t('platform.reportsUsed', {
                      used: business.reportsUsedThisPeriod,
                      total: plan.includedReports,
                    })}
                  </Text>
                  <Text
                    variant="caption"
                    tone={overAllowance ? 'warning' : 'muted'}
                    className="font-sans-semibold"
                  >
                    {overAllowance
                      ? t('platform.onOverage')
                      : formatCedis(plan.monthlyPesewas, { compact: true })}
                  </Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-pill bg-canvas-raise">
                  <View
                    className={
                      overAllowance
                        ? 'h-full rounded-pill bg-warning'
                        : 'h-full rounded-pill bg-accent'
                    }
                    style={{ width: `${usage * 100}%` }}
                  />
                </View>
              </View>

              <View className="flex-row flex-wrap gap-1.5 border-t border-hairline/[0.07] pt-3">
                {business.interests.map((c) => (
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
