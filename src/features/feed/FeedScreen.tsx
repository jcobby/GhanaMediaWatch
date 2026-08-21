import { useCallback, useRef, useState } from 'react';
import { Dimensions, Linking, Platform, View, type ViewToken } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorState, Glass, Pressable, Text } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useFeed } from '@/hooks/useIncidents';
import { FEED_PRELOAD_AHEAD } from '@/lib/constants';
import type { Incident } from '@/types/api';
import { FeedItem } from './FeedItem';
import { FeedSkeleton } from './FeedSkeleton';

/**
 * The home feed — a full-screen vertical pager.
 *
 * Snapping is done with `pagingEnabled` plus a fixed item height equal to the
 * window height, rather than snapToInterval: the item height and the snap
 * interval must agree exactly or the pager drifts by a pixel per page and the
 * error accumulates down a long list.
 *
 * PHASE 5 (in progress). Currently reads seeded fixtures directly; it moves
 * behind TanStack Query and the ApiClient once Phase 2's mock client lands.
 * The component takes `Incident[]` either way, so that swap touches this file
 * only where the data arrives.
 */
export function FeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  // Muted by default, and held at the feed level so the choice persists across
  // cells — a per-cell setting would reset on every swipe.
  const [muted, setMuted] = useState(true);
  const { data, isPending, isError, refetch } = useFeed({ limit: 20 });
  const incidents = data?.items ?? [];

  // Full window height, not the safe-area-inset height: cells are edge-to-edge
  // and draw under both the status bar and the tab bar by design.
  const { height } = Dimensions.get('window');

  /*
   * Exactly one item counts as visible. `itemVisiblePercentThreshold: 80`
   * stops a half-scrolled neighbour from also registering, which is what causes
   * two videos to play at once.
   */
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
    minimumViewTime: 120,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  /**
   * Hand off to the device's own navigation app.
   *
   * Android's `google.navigation:` starts turn-by-turn immediately; iOS uses
   * the Maps URL scheme. The universal https form is the fallback for a device
   * with neither — it opens in a browser rather than failing silently.
   */
  const handleNavigate = useCallback(async (incident: Incident) => {
    const { latitude, longitude } = incident.location;
    if (latitude === null || longitude === null) return;

    const native =
      Platform.OS === 'ios'
        ? `maps://?daddr=${latitude},${longitude}`
        : `google.navigation:q=${latitude},${longitude}`;
    const web = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    try {
      const canOpen = await Linking.canOpenURL(native);
      await Linking.openURL(canOpen ? native : web);
    } catch {
      await Linking.openURL(web).catch(() => undefined);
    }
  }, []);

  const handleOpenDetail = useCallback(
    (incident: Incident) => router.push(`/incident/${incident.id}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Incident; index: number }) => (
      <FeedItem
        incident={item}
        height={height}
        isActive={index === activeIndex}
        onNavigate={handleNavigate}
        onOpenDetail={handleOpenDetail}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
      />
    ),
    [activeIndex, height, handleNavigate, handleOpenDetail, muted],
  );

  // Shaped like a real cell, so a slow request reads as loading rather than
  // as a blank screen.
  if (isPending) return <FeedSkeleton />;

  if (isError) {
    return (
      <View className="flex-1 bg-canvas">
        <ErrorState
          title={t('feed.errorTitle')}
          description={t('common.unknownErrorHelp')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (incidents.length === 0) {
    return (
      <View className="flex-1 bg-canvas">
        <EmptyState
          icon="videocam-outline"
          title={t('feed.emptyTitle')}
          description={t('feed.emptyBody')}
          actionLabel={t('feed.emptyAction')}
          onAction={() => router.push('/capture')}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <FlashList
        data={incidents}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // One screen ahead, exactly — matches the video preload window so the
        // next cell's poster is warm without holding several players in memory.
        drawDistance={height * (1 + FEED_PRELOAD_AHEAD)}
        decelerationRate="fast"
        snapToAlignment="start"
      />

      {/* Feed selector. Owns the top band alone — incident metadata moved down
          to the caption block, which is what caused the earlier collision. */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-center gap-1"
        style={{ top: insets.top + 8 }}
        pointerEvents="box-none"
      >
        <Glass
          context="media"
          elevation="low"
          className="flex-row items-center gap-1.5 rounded-pill px-3.5 py-2"
        >
          <View className="h-1.5 w-1.5 rounded-pill bg-live" />
          <Text variant="body-sm" className="font-sans-semibold" onMedia>
            {t('feed.title')}
          </Text>
        </Glass>

        {/* Map moved out of the tab bar to make room for Earn, so it needs a
            visible way back in. */}
        <Pressable
          onPress={() => router.push('/map')}
          haptic={false}
          accessibilityLabel={t('tabs.map')}
          className="absolute right-4"
        >
          <Glass
            context="media"
            elevation="low"
            className="h-9 w-9 items-center justify-center rounded-pill"
          >
            <Ionicons name="map-outline" size={16} color={colors.textOnDark} />
          </Glass>
        </Pressable>
      </View>
    </View>
  );
}
