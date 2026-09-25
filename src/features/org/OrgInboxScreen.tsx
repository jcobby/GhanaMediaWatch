import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Chip, EmptyState, ErrorState, Glass, SkeletonList, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useOrgDashboard, useOrgInbox } from '@/hooks/useOrg';
import { useAuthStore } from '@/stores/authStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import { useColors } from '@/lib/theme';
import { OrgReportRow } from './OrgReportRow';
import { OrgHeader } from './OrgHeader';

type Filter = 'new' | 'licensed' | 'all';

/**
 * The organisation's inbox — reports the platform routed here.
 *
 * This is the reason the organisation side belongs on a phone at all. The web
 * console does the desk work: billing, team, saved queries, the audit trail.
 * What it cannot do is reach somebody who is not at a desk — and the service
 * pushes `report_routed` to org members, which means the alert arrives on this
 * device. A notification that can only be acted on somewhere else is a
 * notification that waits until Monday.
 *
 * Nothing here is invented. Every row came from `GET /org/inbox` scoped to this
 * organisation; an outage renders as an outage and an empty inbox says it is
 * empty, because those are different facts and a reader has to be able to tell
 * them apart.
 */
export function OrgInboxScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const orgName = useAuthStore((s) => s.profile?.orgName);

  const [filter, setFilter] = useState<Filter>('new');

  const { data, isPending, isError, error, refetch, isRefetching } = useOrgInbox();
  const { data: dashboard } = useOrgDashboard();

  const items = useMemo(() => data?.items ?? [], [data]);

  const counts = useMemo(
    () => ({
      new: items.filter((i) => !i.licensed).length,
      licensed: items.filter((i) => i.licensed).length,
      all: items.length,
    }),
    [items],
  );

  const shown = useMemo(() => {
    if (filter === 'licensed') return items.filter((i) => i.licensed);
    if (filter === 'new') return items.filter((i) => !i.licensed);
    return items;
  }, [filter, items]);

  const failure = describeApiError(error, t, {
    title: t('org.inboxErrorTitle'),
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
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={c.accent} />
      }
    >
      <OrgHeader title={orgName ?? t('org.title')} subtitle={t('org.inbox')} />

      {/*
        The three numbers an operator opens the app for.

        From `GET /org/dashboard` rather than counted off the page in hand: the
        inbox is one page of fifty, and a count derived from it would quietly
        say "fifty" forever on a busy organisation.
      */}
      <View className="flex-row gap-3 px-4 pb-4">
        <Stat
          icon="download-outline"
          label={t('org.statInbox')}
          value={dashboard ? String(dashboard.inboxCount) : '—'}
        />
        <Stat
          icon="megaphone-outline"
          label={t('org.statPublished')}
          value={dashboard ? String(dashboard.publishedCount) : '—'}
        />
        <Stat
          icon="navigate-outline"
          label={t('org.statDispatch')}
          value={dashboard ? String(dashboard.openAssignments) : '—'}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 pb-4"
      >
        {(['new', 'licensed', 'all'] as const).map((value) => (
          <Chip
            key={value}
            label={`${t(`org.filter.${value}`)} · ${counts[value]}`}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </ScrollView>

      <View className="gap-2 px-4">
        {isPending ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState
            title={failure.title}
            description={failure.body}
            retryLabel={t('common.retry')}
            onRetry={() => void refetch()}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={filter === 'licensed' ? 'ribbon-outline' : 'file-tray-outline'}
            title={filter === 'licensed' ? t('org.noLicencesTitle') : t('org.emptyInboxTitle')}
            /*
             * A filter hiding everything is not the same as an empty inbox, and
             * only one of them is a reason to explain how routing works.
             */
            description={
              filter === 'licensed' ? t('org.noLicencesBody') : t('org.emptyInboxBody')
            }
          />
        ) : (
          shown.map((report) => (
            <OrgReportRow
              key={report.id}
              report={report}
              onOpen={() => router.push(`/inbox/${report.id}`)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <Glass elevation="low" className="flex-1 items-center gap-1 rounded-lg py-3.5">
      <Ionicons name={icon} size={16} color={c.textMuted} />
      <Text variant="title-lg" className="font-display">
        {value}
      </Text>
      <Text variant="caption" tone="muted" className="text-center uppercase">
        {label}
      </Text>
    </Glass>
  );
}
