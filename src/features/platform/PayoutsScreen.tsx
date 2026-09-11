import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Glass, Pressable, Text } from '@/components/ui';
import { PAYOUT_BATCHES, type PayoutBatch } from '@/api/dawuroData';
import { useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { DeskOnly } from './DeskOnly';
import { formatCedis } from '@/types/dawuro';

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
 * Releasing a batch is the most consequential action an operator takes, and it
 * does not happen here. An accidental release cannot be undone — the money has
 * left — and it has to reconcile against a ledger nobody can read on a phone.
 *
 * This screen used to release, which made the platform tier a second authority
 * alongside the web console with nothing saying which had actually paid. The
 * batches and their state are still shown, because knowing a run is waiting is
 * useful anywhere; the release is at a desk. See `DeskOnly`.
 */
export function PayoutsScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Read-only on the phone: no batch changes state here.
  const batches = PAYOUT_BATCHES;

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
          <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
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
              <Ionicons name="time-outline" size={13} color={c.textFaint} />
              <Text variant="caption" tone="muted" className="flex-1">
                {batch.settledAtIso
                  ? t('platform.settledAgo', { time: formatRelativeTime(batch.settledAtIso) })
                  : t('platform.createdAgo', { time: formatRelativeTime(batch.createdAtIso) })}
              </Text>
            </View>

            {batch.status === 'draft' ? <DeskOnly reason={t('deskOnly.payout')} /> : null}
          </Glass>
        ))}

        <View className="flex-row items-start gap-2.5 rounded-lg bg-warning-wash p-3.5">
          <Ionicons name="information-circle-outline" size={15} color={c.warning} />
          <Text variant="caption" tone="warning" className="flex-1">
            {t('platform.payoutSimulation')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
