import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Glass, Pressable, ProgressBar, Text } from '@/components/ui';
import { useSurveys } from '@/hooks/useSurveys';
import { useEarningsGate } from './EarningsGate';
import { useCommissions, useEarnings } from '@/hooks/useEarnings';
import { accentGradient, categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { formatCedis } from '@/types/dawuro';
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
 * A guest sees everything but the balance. That is deliberate: the ways to earn
 * and what other people have earned are the argument for making an account, and
 * withholding them would leave a signed-out reporter looking at a sign-in
 * prompt with no reason to accept it.
 */
export function EarnHubScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const earningsQuery = useEarnings();
  const { data: earnings } = earningsQuery;
  const { data: ledger } = useCommissions();

  /*
   * Asked before the balance is drawn: is there an account behind this at all?
   *
   * `/me/earnings` answers 403 to a device token, so a guest's query *fails* —
   * and with only `data` read, that failure fell into the zeroed default below
   * and rendered as "GH₵0.00 available" with a payout bar under it. A person
   * who has not signed up was being told a fact about an account they do not
   * have, on the screen whose job is to persuade them to make one.
   */
  const gate = useEarningsGate({
    isPending: earningsQuery.isPending,
    isError: earningsQuery.isError,
    error: earningsQuery.error,
    refetch: () => void earningsQuery.refetch(),
  });

  /*
   * Zero once the request has actually succeeded.
   *
   * Still defaulted, because `undefined` through `formatCedis` renders
   * "GH₵NaN" — but it is now only reachable for a signed-in reporter whose
   * totals came back, where zero is the true answer rather than a stand-in for
   * three different situations.
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
  /*
   * Whether the balance clears the floor — not whether anything can be pulled.
   *
   * This was `canWithdraw`, and the name did the damage. A reporter cannot
   * withdraw: the platform runs payouts in batches, and the only thing the
   * reporter controls is whether a mobile-money number is on file. But the name
   * invited copy to match it — "You can withdraw now." — so the screen announced
   * an action, offered no button for it, and left somebody to conclude either
   * that the app was broken or that they were being kept from their money, on
   * the one screen where trust is the entire product.
   *
   * `thresholdMetNextRun` is what the earnings screen has always said, and it
   * describes the mechanism instead: paid into your number on the next run.
   */
  const clearsThreshold = summary.pendingPesewas >= summary.payoutThresholdPesewas;

  const { data: surveys } = useSurveys();

  const openSurveys = useMemo(
    () => (surveys ?? []).filter((s) => isAcceptingResponses(s)),
    [surveys],
  );
  const recent = (ledger ?? []).slice(0, 3);

  /*
   * "What organisations are looking for" was here, and it could never show
   * anything.
   *
   * It tallied each organisation's declared interests — except the public
   * directory does not carry interests, so the tally fell back to
   * `organisationStore`'s overrides, which only the organisation account screen
   * ever wrote. That screen left the phone for the web console. The store has
   * been permanently empty ever since, so the section rendered its empty state
   * on every launch, for every reporter, saying "no organisations are buying
   * right now" over a directory that might be full of them.
   *
   * A wrong answer delivered confidently is worse than no section, and there is
   * no endpoint that answers the question honestly — `GET /organisations`
   * returns id, name, sector, verified, logo and two counts, and nothing about
   * what anyone wants. It comes back when the service can say.
   */

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 }}
      contentContainerClassName="gap-5 px-4"
      showsVerticalScrollIndicator={false}
    >
      <Text variant="display-md">{t('earn.title')}</Text>

      {/*
        The balance, or the reason there isn't one.

        Everything below the gate — the ways to earn, the recent rows — is
        still worth seeing while signed out: it is the answer to "why would I
        make an account". Only the figure itself is withheld, because only the
        figure requires one.
      */}
      {gate}

      {/* Balance */}
      {gate ? null : (
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
          {clearsThreshold
            ? t('earnings.thresholdMetNextRun')
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
      )}

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
