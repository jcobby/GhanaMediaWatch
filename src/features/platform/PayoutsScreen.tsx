import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Glass, Pressable, Text } from '@/components/ui';
import { PAYOUT_BATCHES, type PayoutBatch } from '@/api/dawuroData';
import { colors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { formatCedis } from '@/types/dawuro';
import { toast } from '@/stores/toastStore';

const TONE: Record<PayoutBatch['status'], 'neutral' | 'accent' | 'success'> = {
  draft: 'neutral',
  processing: 'accent',
  settled: 'success',
};

/**
 * Payout batches.
 *
 * Reporters are paid in runs rather than per report — a mobile-money transfer
 * for every twenty-cedi commission would cost more in fees than it moves.
 *
 * Releasing a batch is the most consequential action an operator takes, so it
 * is a deliberate two-step. An accidental release cannot be undone; the money
 * has left.
 */
export function PayoutsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [batches, setBatches] = useState(PAYOUT_BATCHES);
  const [confirming, setConfirming] = useState<string | null>(null);

  const release = (id: string) => {
    setBatches((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, status: 'settled' as const, settledAtIso: new Date().toISOString() }
          : b,
      ),
    );
    setConfirming(null);
    toast.success(t('platform.batchReleasedTitle'), t('platform.batchReleasedBody'));
  };

  return (
    <View className="flex-1 bg-canvas">
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
          className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text variant="title-lg" className="flex-1">
          {t('platform.payouts')}
        </Text>
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        {batches.map((batch) => (
          <Glass key={batch.id} elevation="low" className="gap-3 rounded-lg p-4">
            <View className="flex-row items-start justify-between">
              <View className="gap-0.5">
                <Text variant="display-md" className="font-display">
                  {formatCedis(batch.totalPesewas, { compact: true })}
                </Text>
                <Text variant="caption" tone="muted">
                  {t('platform.acrossReporters', { count: batch.reporterCount })}
                </Text>
              </View>
              <Badge label={t(`platform.batch.${batch.status}`)} tone={TONE[batch.status]} />
            </View>

            <View className="flex-row items-center gap-1.5 border-t border-hairline/[0.07] pt-3">
              <Ionicons name="time-outline" size={13} color={colors.textFaint} />
              <Text variant="caption" tone="muted" className="flex-1">
                {batch.settledAtIso
                  ? t('platform.settledAgo', { time: formatRelativeTime(batch.settledAtIso) })
                  : t('platform.createdAgo', { time: formatRelativeTime(batch.createdAtIso) })}
              </Text>
            </View>

            {batch.status === 'draft' ? (
              confirming === batch.id ? (
                <View className="gap-2">
                  <Text variant="caption" tone="warning">
                    {t('platform.releaseWarning', {
                      amount: formatCedis(batch.totalPesewas),
                      count: batch.reporterCount,
                    })}
                  </Text>
                  <View className="flex-row gap-2">
                    <Button
                      label={t('common.cancel')}
                      variant="glass"
                      className="flex-1"
                      onPress={() => setConfirming(null)}
                    />
                    <Button
                      label={t('platform.confirmRelease')}
                      className="flex-[2]"
                      onPress={() => release(batch.id)}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  label={t('platform.releaseBatch')}
                  fullWidth
                  onPress={() => setConfirming(batch.id)}
                />
              )
            ) : null}
          </Glass>
        ))}

        <View className="flex-row items-start gap-2.5 rounded-lg bg-warning-wash p-3.5">
          <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
          <Text variant="caption" tone="warning" className="flex-1">
            {t('platform.payoutSimulation')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
