import { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Glass, SkeletonList, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useOrgDashboard, useOrgLicences } from '@/hooks/useOrg';
import { useAuthStore } from '@/stores/authStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import { useColors } from '@/lib/theme';
import { formatDate } from '@/lib/format';
import { SUBSCRIPTION_PLANS, downloadCharge, formatCedis, isUnlimited } from '@/types/dawuro';
import { OrgReportRow } from './OrgReportRow';
import { OrgHeader } from './OrgHeader';

/**
 * Everything this organisation has licensed.
 *
 * A licence is the transaction the whole platform turns on: the organisation
 * pays, the reporter is paid a commission, and the footage becomes the
 * organisation's to use. So this screen answers three questions and nothing
 * else — what do we hold, when did we buy it, and what is it costing us this
 * period.
 *
 * **Built from the inbox, because the service has no licence list.** There is no
 * `/org/licences` endpoint; what exists is `licensed` and `licensedAt` on each
 * `GET /org/inbox` item, and those two fields are the complete record. Before
 * the service sent them no client could show this at all — the web console kept
 * the licensed set in browser memory, so a page reload lost every licence an
 * organisation had bought that session, along with any way to act on one.
 *
 * The consequence of that derivation is worth being honest about rather than
 * papering over: this lists licensed reports that are **still in the inbox
 * page**. It is the same set the console shows and the same set the service
 * exposes. A dedicated endpoint would be better, and when one lands only
 * `useOrgLicences` changes.
 */
export function OrgLicencesScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const orgName = useAuthStore((s) => s.profile?.orgName);

  const { licences, isPending, isError, isRefetching, error, refetch } = useOrgLicences();
  const { data: dashboard } = useOrgDashboard();

  const tier = dashboard?.subscription?.tier ?? null;
  const plan = tier ? SUBSCRIPTION_PLANS[tier] : null;

  /*
   * What the next licence costs, in the organisation's own words.
   *
   * `null` rather than zero when the tier is unknown. Zero and "included in the
   * plan" look identical on screen and mean opposite things to somebody about
   * to spend money, and the tier arrives as a bare string that this client
   * refuses to guess at.
   */
  const perReport = useMemo(() => {
    if (!plan) return null;
    return isUnlimited(plan) ? t('org.includedInPlan') : formatCedis(downloadCharge(plan));
  }, [plan, t]);

  const failure = describeApiError(error, t, {
    title: t('org.licencesErrorTitle'),
    body: t('org.inboxErrorBody'),
  });

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE,
      }}
      showsVerticalScrollIndicator={false}
      /* Pull to refresh, like the inbox and the dispatch board. A licence bought
         on a colleague's phone appears here only when this one asks again. */
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />
      }
    >
      <OrgHeader title={orgName ?? t('org.title')} subtitle={t('org.licences')} />

      {/*
        The period, not the lifetime.

        `reportsUsedThisPeriod` is what the invoice is being built from and what
        an allowance is measured against, so it is the number that can change
        somebody's mind about the next licence. A lifetime total cannot.
      */}
      <View className="px-4 pb-4">
        <Glass elevation="low" className="gap-3 rounded-lg p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="ribbon-outline" size={16} color={c.textMuted} />
            <Text variant="label" tone="muted">
              {t('org.thisPeriod')}
            </Text>
          </View>
          <View className="flex-row items-end gap-4">
            <View className="flex-1 gap-0.5">
              <Text variant="display-md" className="font-display">
                {dashboard ? String(dashboard.subscription?.reportsUsedThisPeriod ?? 0) : '—'}
              </Text>
              <Text variant="caption" tone="muted" className="uppercase">
                {t('org.licensedThisPeriod')}
              </Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text variant="title-md">{perReport ?? '—'}</Text>
              <Text variant="caption" tone="muted" className="uppercase">
                {t('org.perReport')}
              </Text>
            </View>
          </View>
        </Glass>
      </View>

      <View className="gap-2 px-4">
        {isPending ? (
          <SkeletonList count={3} />
        ) : isError ? (
          <ErrorState
            title={failure.title}
            description={failure.body}
            retryLabel={t('common.retry')}
            onRetry={refetch}
          />
        ) : licences.length === 0 ? (
          <EmptyState
            icon="ribbon-outline"
            title={t('org.noLicencesTitle')}
            description={t('org.noLicencesBody')}
          />
        ) : (
          licences.map((report) => (
            <View key={report.id} className="gap-1">
              <OrgReportRow report={report} onOpen={() => router.push(`/inbox/${report.id}`)} />
              {/*
                The date under the row rather than inside it.

                `licensedAt` is null on a licence the service did not date, and
                a row that silently drops it would read as "licensed just now"
                beside rows that carry real dates. Absent is said out loud.
              */}
              <Text variant="caption" tone="faint" className="px-3">
                {report.licensedAt
                  ? t('org.licensedOn', { date: formatDate(report.licensedAt) })
                  : t('org.licensedDateUnknown')}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
