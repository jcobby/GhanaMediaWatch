import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Glass, Pressable, ProgressBar, Sheet, Text } from '@/components/ui';
import { useCommissions, useEarnings } from '@/hooks/useEarnings';
import { accentGradient, categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { formatCedis, type CommissionStatus } from '@/types/dawuro';
import { payoutProgress, sumPesewas } from './commission';
import { toast } from '@/stores/toastStore';

const STATUS_TONE: Record<CommissionStatus, 'neutral' | 'success' | 'accent' | 'danger'> = {
  pending: 'neutral',
  earned: 'accent',
  paid: 'success',
  void: 'danger',
};

/** Ghana's mobile money networks. */
const MOMO_NETWORKS = ['MTN MoMo', 'Telecel Cash', 'AT Money'] as const;

/**
 * The reporter's wallet.
 *
 * Earnings are the reason a member of the public keeps filing reports, so the
 * ledger is deliberately legible: every row names the organisation that licensed
 * the report and what it paid. An opaque balance invites the suspicion that the
 * platform is skimming.
 */
export function EarningsScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [network, setNetwork] = useState<string>(MOMO_NETWORKS[0]);
  const [momoNumber, setMomoNumber] = useState('');
  const [processing, setProcessing] = useState(false);

  const { data: earnings } = useEarnings();
  const { data: commissions } = useCommissions();

  // Zero while loading: for a reporter with nothing yet, that is also the
  // right answer, and `undefined` through `formatCedis` renders "GH₵NaN".
  const summary = earnings ?? {
    pendingPesewas: 0,
    paidPesewas: 0,
    lifetimePesewas: 0,
    reportsLicensed: 0,
    payoutThresholdPesewas: 0,
    nextPayoutIso: null,
  };
  // Memoised because it feeds a `useMemo` below: a fresh `[]` on every render
  // would invalidate the reconciliation on every render.
  const ledger = useMemo(() => commissions ?? [], [commissions]);
  const progress = payoutProgress(summary.pendingPesewas, summary.payoutThresholdPesewas);
  const canWithdraw = summary.pendingPesewas >= summary.payoutThresholdPesewas;

  /*
   * The headline balance is checked against the ledger rather than trusted.
   *
   * A wallet whose total disagrees with the rows beneath it destroys trust
   * faster than any missing feature, so a mismatch is surfaced to the user
   * instead of being quietly rendered.
   */
  const ledgerMismatch = useMemo(() => {
    // Nothing to reconcile until both halves have arrived; an empty ledger
    // against a non-zero total is a loading state, not a discrepancy.
    if (!earnings || !commissions) return false;
    const earnedTotal = sumPesewas(
      ledger.filter((e) => e.status === 'earned').map((e) => e.amountPesewas),
    );
    return earnedTotal !== summary.pendingPesewas;
  }, [earnings, commissions, ledger, summary.pendingPesewas]);

  const handleWithdraw = async () => {
    setProcessing(true);
    try {
      // SIMULATION ONLY. No payment rail is connected — a real integration
      // means a mobile-money provider, KYC on the reporter, and a settlement
      // account. Flagged in API_CONTRACT.md.
      await new Promise((resolve) => setTimeout(resolve, 1400));
      setPayoutOpen(false);
      toast.success(
        t('earnings.payoutSentTitle', { amount: formatCedis(summary.pendingPesewas) }),
        t('earnings.payoutSentBody', { network }),
      );
    } finally {
      setProcessing(false);
    }
  };

  /*
   * The keyboard covers the bottom of the screen, which is where a form's last
   * field and its submit button live. Every screen here that takes typed input
   * needs this; only the sign-in screens had it, so the rest hid the control
   * you were reaching for the moment you tapped to type.
   *
   * `padding` on iOS, matching the sign-in screens. Left unset on Android,
   * where the window resizing under `adjustResize` already does it — the
   * exception is a `Modal`, which that does not reach, and which `Sheet`
   * handles itself.
   */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        /*
          Without this the first tap while the keyboard is up only dismisses
          it, and the button under your finger does nothing — so every action
          on a form takes two taps and the first one looks broken.
        */
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
        contentContainerClassName="gap-5 px-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <Text variant="title-lg">{t('earnings.title')}</Text>
        </View>

        {/* Balance */}
        <LinearGradient
          colors={[...accentGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 20, gap: 16 }}
        >
          <View className="gap-1">
            <Text variant="caption" className="uppercase text-white/70">
              {t('earnings.available')}
            </Text>
            <Text variant="display-lg" className="font-display text-white">
              {formatCedis(summary.pendingPesewas)}
            </Text>
          </View>

          <View className="gap-2">
            <ProgressBar
              progress={progress}
              accessibilityLabel={t('earnings.progressLabel', {
                percent: Math.round(progress * 100),
              })}
            />
            <Text variant="caption" className="text-white/80">
              {canWithdraw
                ? t('earnings.thresholdMet')
                : t('earnings.thresholdRemaining', {
                    amount: formatCedis(summary.payoutThresholdPesewas - summary.pendingPesewas),
                  })}
            </Text>
          </View>

          <Button
            label={t('earnings.withdraw')}
            variant="glass"
            fullWidth
            disabled={!canWithdraw}
            onPress={() => setPayoutOpen(true)}
          />
        </LinearGradient>

        {/* Lifetime figures */}
        <View className="flex-row gap-3">
          <Stat
            label={t('earnings.paidOut')}
            value={formatCedis(summary.paidPesewas, { compact: true })}
          />
          <Stat
            label={t('earnings.lifetime')}
            value={formatCedis(summary.lifetimePesewas, { compact: true })}
          />
          <Stat label={t('earnings.licensed')} value={String(summary.reportsLicensed)} />
        </View>

        {/* Ledger */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('earnings.ledger')}
          </Text>
          <View className="gap-2">
            {ledger.map((entry) => (
              <Glass
                key={entry.id}
                elevation="low"
                className="flex-row items-center gap-3 rounded-lg p-3.5"
              >
                <View
                  style={{ backgroundColor: categoryHue(entry.category) }}
                  className="h-10 w-1 rounded-pill"
                />
                <View className="flex-1 gap-1">
                  <Text variant="body-sm" numberOfLines={1}>
                    {entry.incidentSummary}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Badge
                      label={t(`earnings.status.${entry.status}`)}
                      tone={STATUS_TONE[entry.status]}
                    />
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {entry.businessName ?? t('earnings.notYetLicensed')} ·{' '}
                      {formatRelativeTime(entry.createdAtIso)}
                    </Text>
                  </View>
                </View>
                <Text
                  variant="body"
                  tone={entry.status === 'void' ? 'faint' : 'primary'}
                  className="font-sans-semibold"
                >
                  {entry.status === 'void' ? '—' : formatCedis(entry.amountPesewas)}
                </Text>
              </Glass>
            ))}
          </View>
        </View>

        {ledgerMismatch ? (
          <Glass elevation="low" className="flex-row items-start gap-2.5 rounded-lg p-3.5">
            <Ionicons name="alert-circle-outline" size={16} color={c.warning} />
            <Text variant="caption" tone="warning" className="flex-1">
              {t('earnings.mismatchNotice')}
            </Text>
          </Glass>
        ) : null}

        {/* How it works — the model is unusual enough to warrant explaining. */}
        <Glass elevation="low" className="gap-2 rounded-lg p-4">
          <Text variant="body-sm" className="font-sans-semibold">
            {t('earnings.howTitle')}
          </Text>
          <Text variant="caption" tone="muted">
            {t('earnings.howBody')}
          </Text>
        </Glass>
      </ScrollView>

      {/* Simulated mobile money payout */}
      <Sheet
        visible={payoutOpen}
        onClose={() => setPayoutOpen(false)}
        title={t('earnings.withdrawTitle')}
        subtitle={t('earnings.withdrawSubtitle', { amount: formatCedis(summary.pendingPesewas) })}
      >
        <View className="gap-4">
          <View className="gap-2">
            <Text variant="label" tone="muted">
              {t('earnings.network')}
            </Text>
            <View className="flex-row gap-2">
              {MOMO_NETWORKS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setNetwork(n)}
                  accessibilityState={{ selected: network === n }}
                  accessibilityLabel={n}
                  className={
                    network === n
                      ? 'flex-1 items-center rounded-lg border border-accent bg-accent-wash py-3'
                      : 'flex-1 items-center rounded-lg border border-hairline/[0.10] py-3'
                  }
                >
                  <Text
                    variant="caption"
                    tone={network === n ? 'accent' : 'muted'}
                    className="font-sans-semibold"
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text variant="label" tone="muted">
              {t('earnings.momoNumber')}
            </Text>
            <Glass elevation="low" className="rounded-lg px-4">
              <TextInput
                value={momoNumber}
                onChangeText={setMomoNumber}
                placeholder="024 000 0000"
                placeholderTextColor={c.textFaint}
                keyboardType="phone-pad"
                accessibilityLabel={t('earnings.momoNumber')}
                style={{
                  height: 52,
                  color: c.textPrimary,
                  fontFamily: 'Inter_400Regular',
                  fontSize: 16,
                }}
              />
            </Glass>
          </View>

          {/* Said plainly, because a fake payment that looks real is worse than
              an obvious placeholder. */}
          <View className="flex-row items-start gap-2 rounded-lg bg-warning-wash p-3">
            <Ionicons name="information-circle-outline" size={15} color={c.warning} />
            <Text variant="caption" tone="warning" className="flex-1">
              {t('earnings.simulationNotice')}
            </Text>
          </View>

          <Button
            label={t('earnings.confirmWithdraw')}
            size="lg"
            fullWidth
            loading={processing}
            disabled={momoNumber.trim().length < 9}
            onPress={() => void handleWithdraw()}
          />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Glass elevation="low" className="flex-1 items-center gap-1 rounded-lg py-3.5">
      <Text variant="title-md" className="font-display">
        {value}
      </Text>
      <Text variant="caption" tone="muted" className="uppercase">
        {label}
      </Text>
    </Glass>
  );
}
