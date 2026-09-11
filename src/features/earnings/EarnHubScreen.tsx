import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Glass, Pressable, ProgressBar, Text } from '@/components/ui';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { useSurveys } from '@/hooks/useSurveys';
import { useCommissions, useEarnings } from '@/hooks/useEarnings';
import { accentGradient, categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { formatCedis } from '@/types/dawuro';
import { useBusinessStore } from '@/stores/organisationStore';
import { payoutProgress } from './commission';
import { isAcceptingResponses } from '@/features/surveys/surveyLogic';

/**
 * The Earn tab — why a reporter comes back.
 *
 * The product's aim is getting information to organisations who can act on it,
 * and payment is what makes someone do that a second time. So this screen leads
 * with the balance, then with the two ways to add to it: film something an
 * organisation wants, or answer a paid question.
 *
 * "Who is looking for what" sits directly beneath, because the most common
 * reason a reporter earns nothing is filming something nobody asked for.
 */
export function EarnHubScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: earnings } = useEarnings();
  const { data: ledger } = useCommissions();

  /*
   * Zero, not undefined, while the request is in flight.
   *
   * A reporter with no earnings and a reporter whose totals have not loaded
   * see the same thing — which is correct, because the honest reading of both
   * is "nothing here yet". Rendering `undefined` through `formatCedis` would
   * put "GH₵NaN" on the money screen.
   */
  const summary = earnings ?? {
    pendingPesewas: 0,
    paidPesewas: 0,
    lifetimePesewas: 0,
    reportsLicensed: 0,
    payoutThresholdPesewas: 0,
    nextPayoutIso: null,
  };
  const progress = payoutProgress(summary.pendingPesewas, summary.payoutThresholdPesewas);
  const canWithdraw = summary.pendingPesewas >= summary.payoutThresholdPesewas;

  // Reads through the same overrides the organisation account screen writes, so
  // an organisation narrowing its interests shows up here as less demand.
  const overrides = useBusinessStore((s) => s.interestOverrides);

  const { data: surveys } = useSurveys();
  const { data: directory } = useOrganisations();

  const openSurveys = useMemo(
    () => (surveys ?? []).filter((s) => isAcceptingResponses(s)),
    [surveys],
  );
  const recent = (ledger ?? []).slice(0, 3);

  /*
   * What organisations are actively buying, derived from their declared
   * interests. A reporter who knows NADMO wants flood footage films the right
   * thing; one who does not films a sunset and earns nothing.
   */
  const demand = useMemo(() => {
    const counts = new Map<string, number>();
    /*
      Only what the newsroom itself has told this phone.

      This tallied `b.interests` from the directory, which never carries them —
      so every organisation contributed an undefined list and the tally was
      built entirely on locally stored overrides while appearing to summarise
      the platform. An organisation with no override contributes nothing, which
      is the honest answer: the phone does not know what it is looking for
      until `GET /organisations` says.
    */
    receiving(directory).forEach((b) =>
      (overrides[b.id] ?? []).forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)),
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [directory, overrides]);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 }}
      contentContainerClassName="gap-5 px-4"
      showsVerticalScrollIndicator={false}
    >
      <Text variant="display-md">{t('earn.title')}</Text>

      {/* Balance */}
      <LinearGradient
        colors={[...accentGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 20, padding: 20, gap: 14 }}
      >
        <View className="gap-0.5">
          <Text variant="caption" className="uppercase text-white/70">
            {t('earnings.available')}
          </Text>
          <Text variant="display-lg" className="font-display text-white">
            {formatCedis(summary.pendingPesewas)}
          </Text>
        </View>
        <ProgressBar
          progress={progress}
          accessibilityLabel={t('earnings.progressLabel', { percent: Math.round(progress * 100) })}
        />
        <Text variant="caption" className="text-white/80">
          {canWithdraw
            ? t('earnings.thresholdMet')
            : t('earnings.thresholdRemaining', {
                amount: formatCedis(summary.payoutThresholdPesewas - summary.pendingPesewas),
              })}
        </Text>
        <Button
          label={t('earn.viewWallet')}
          variant="glass"
          fullWidth
          onPress={() => router.push('/earnings')}
        />
      </LinearGradient>

      {/* The two ways to earn. Filming leads — it is the product. */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('earn.waysToEarn')}
        </Text>

        <Pressable onPress={() => router.push('/capture')} accessibilityLabel={t('earn.filmTitle')}>
          <Glass elevation="mid" className="flex-row items-center gap-3.5 rounded-lg p-4">
            <LinearGradient
              colors={[...accentGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="videocam" size={21} color={c.textOnDark} />
            </LinearGradient>
            <View className="flex-1 gap-0.5">
              <Text variant="title-sm">{t('earn.filmTitle')}</Text>
              <Text variant="caption" tone="muted">
                {t('earn.filmBody')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </Glass>
        </Pressable>

        <Pressable
          onPress={() => router.push('/surveys')}
          accessibilityLabel={t('earn.surveyTitle')}
        >
          <Glass elevation="low" className="flex-row items-center gap-3.5 rounded-lg p-4">
            <View className="h-11 w-11 items-center justify-center rounded-md bg-success-wash">
              <Ionicons name="clipboard-outline" size={20} color={c.success} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text variant="title-sm">{t('earn.surveyTitle')}</Text>
              <Text variant="caption" tone="muted">
                {openSurveys.length > 0
                  ? t('earn.surveyBody', { count: openSurveys.length })
                  : t('earn.surveyNone')}
              </Text>
            </View>
            {openSurveys.length > 0 ? (
              <Badge label={String(openSurveys.length)} tone="success" />
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </Glass>
        </Pressable>
      </View>

      {/* What organisations want right now */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('earn.inDemand')}
        </Text>
        <Glass elevation="low" className="gap-3 rounded-lg p-4">
          <Text variant="caption" tone="muted">
            {t('earn.inDemandHelp')}
          </Text>
          {/*
            No organisations means no demand, and saying so is the point.

            An empty row of chips reads as a rendering fault. What it actually
            means is that nobody is currently buying footage — which is the
            single most useful thing this screen can tell somebody deciding
            whether to go and film something.
          */}
          {demand.length === 0 ? (
            <Text variant="body-sm" tone="muted">
              {t('earn.noDemand')}
            </Text>
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            {demand.map(([category, count]) => (
              <View
                key={category}
                className="flex-row items-center gap-2 rounded-pill bg-canvas-raise px-3 py-1.5"
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: categoryHue(category),
                  }}
                />
                <Text variant="body-sm">{t(`category.${category}`)}</Text>
                <Text variant="caption" tone="accent" className="font-sans-semibold">
                  {count}
                </Text>
              </View>
            ))}
          </View>
        </Glass>
      </View>

      {/* Recent activity */}
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="muted">
            {t('earn.recent')}
          </Text>
          <Pressable
            onPress={() => router.push('/earnings')}
            haptic={false}
            accessibilityLabel={t('common.viewAll')}
          >
            <Text variant="caption" tone="accent" className="font-sans-semibold">
              {t('common.viewAll')}
            </Text>
          </Pressable>
        </View>
        <View className="gap-2">
          {recent.map((entry) => (
            <Glass
              key={entry.id}
              elevation="low"
              className="flex-row items-center gap-3 rounded-lg p-3.5"
            >
              <View
                style={{ backgroundColor: categoryHue(entry.category) }}
                className="h-9 w-1 rounded-pill"
              />
              <View className="flex-1 gap-0.5">
                <Text variant="body-sm" numberOfLines={1}>
                  {entry.incidentSummary}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {entry.businessName ?? t('earnings.notYetLicensed')} ·{' '}
                  {formatRelativeTime(entry.createdAtIso)}
                </Text>
              </View>
              <Text
                variant="body-sm"
                tone={entry.status === 'void' ? 'faint' : 'success'}
                className="font-sans-semibold"
              >
                {entry.status === 'void' ? '—' : formatCedis(entry.amountPesewas)}
              </Text>
            </Glass>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
