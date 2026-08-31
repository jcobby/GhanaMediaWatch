import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useFeed } from '@/hooks/useIncidents';
import { FeedRow } from './FeedRow';
import { FeedBar } from './FeedBar';
import { CategoryTabs } from './CategoryTabs';
import { SlidesViewer } from './SlidesViewer';
import { FeedSkeleton } from './FeedSkeleton';
import type { Incident, IncidentCategory } from '@/types/api';

/**
 * The public feed.
 *
 * A scrolling list of cards on a light ground, not a full-screen pager. The
 * pager format suited entertainment — one clip at a time, swipe for the next —
 * but people read this feed to answer questions: has anyone reported the
 * junction I am about to drive through, is this the same flood I saw yesterday,
 * did anybody respond. Those need several reports visible at once.
 *
 * Nothing autoplays. Video plays when someone taps it, which also means the
 * feed costs almost nothing to scroll on mobile data.
 */
export function FeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isPending, isError, refetch } = useFeed({ limit: 20 });
  const incidents = useMemo(() => data?.items ?? [], [data]);

  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [searching, setSearching] = useState(false);
  const [slidesFrom, setSlidesFrom] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  /*
   * Only categories actually present, commonest first. A filter that turns out
   * to be empty makes the app feel half-built.
   */
  const available = useMemo(() => {
    const counts = new Map<IncidentCategory, number>();
    for (const incident of incidents) {
      counts.set(incident.category, (counts.get(incident.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [incidents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter((incident) => {
      if (category && incident.category !== category) return false;
      if (!q) return true;
      return (
        incident.description.toLowerCase().includes(q) ||
        (incident.location.label ?? '').toLowerCase().includes(q)
      );
    });
  }, [incidents, category, query]);

  const handleOpenDetail = useCallback(
    (incident: Incident) => router.push(`/incident/${incident.id}`),
    [router],
  );

  /*
   * Tapping the comment icon lands on the comments, not the top of the report.
   * Someone who taps a speech bubble has already decided to read the
   * discussion.
   */
  const renderItem = useCallback(
    ({ item }: { item: Incident }) => <FeedRow incident={item} onOpen={handleOpenDetail} />,
    [handleOpenDetail],
  );

  /*
   * The bar and the tabs are pinned rather than scrolled with the list.
   *
   * They were a ListHeaderComponent before, which meant the only way back to
   * another category was to scroll to the top first. On a feed people scan
   * deep into, that turns a one-tap action into a long flick.
   */
  const chrome = (
    <>
      <FeedBar
        query={query}
        onQuery={setQuery}
        searching={searching}
        onToggleSearch={() => {
          setSearching((v) => !v);
          if (searching) setQuery('');
        }}
        onOpenMap={() => router.push('/map')}
        onOpenSlides={() => setSlidesFrom(0)}
        onOpenBusinesses={() => router.push('/businesses')}
      />
      <CategoryTabs selected={category} onSelect={setCategory} available={available} />
    </>
  );

  if (isPending) return <FeedSkeleton />;

  if (isError) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ErrorState
          title={t('feed.errorTitle')}
          description={t('feed.errorBody')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas-soft" style={{ paddingTop: insets.top }}>
      {chrome}
      <FlashList
        data={visible}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        onRefresh={() => void refetch()}
        refreshing={false}
        ListEmptyComponent={
          <View className="pt-6">
            <EmptyState
              icon="search-outline"
              title={t('feed.noMatchesTitle')}
              description={t('feed.noMatchesBody')}
            />
          </View>
        }
        ListFooterComponent={
          visible.length > 0 ? (
            <Text variant="caption" tone="faint" className="py-6 text-center">
              {t('feed.endOfFeed')}
            </Text>
          ) : null
        }
      />

      {/* Plays `visible`, not `incidents` — the filter the reader chose comes
          with them into slides rather than being silently dropped. */}
      {slidesFrom !== null && visible.length > 0 ? (
        <SlidesViewer
          incidents={visible}
          startAt={slidesFrom}
          onClose={() => setSlidesFrom(null)}
          onOpen={(incident) => {
            setSlidesFrom(null);
            handleOpenDetail(incident);
          }}
        />
      ) : null}
    </View>
  );
}
