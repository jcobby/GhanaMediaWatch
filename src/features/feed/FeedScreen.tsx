import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useFeed } from '@/hooks/useIncidents';
import { FeedRow } from './FeedRow';
import { TopStories } from './TopStories';
import { topStorySettings } from './topStorySettings';
import { FeedBar } from './FeedBar';
import { SectionTabs } from './SectionTabs';
import { adjacentDesk, type NewsSection } from '@/types/sections';
import { describeApiError } from '@/lib/apiErrorCopy';
import { SlidesViewer } from './SlidesViewer';
import { FeedSkeleton } from './FeedSkeleton';
import type { Incident } from '@/types/api';

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

  const { data, isPending, isError, error, refetch } = useFeed({ limit: 20 });
  const incidents = useMemo(() => data?.items ?? [], [data]);

  const [searching, setSearching] = useState(false);
  const [slidesFrom, setSlidesFrom] = useState<number | null>(null);
  const [section, setSection] = useState<NewsSection | null>(null);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter((incident) => {
      if (section && incident.section !== section) return false;
      if (!q) return true;
      return (
        incident.description.toLowerCase().includes(q) ||
        (incident.location.label ?? '').toLowerCase().includes(q)
      );
    });
  }, [incidents, section, query]);

  /*
   * The top stories, and everything after them.
   *
   * Split here rather than rendered inside the list, so the rotation is a real
   * header the rows never mistake themselves for — the separator logic and the
   * row layout stay about rows.
   *
   * **How many is the desk's decision, not this screen's.** The count comes from
   * the platform settings; the stories themselves are the top of the order the
   * server already returned, which is the judgement an editor made when they
   * published each one to a section. Choosing differently here would be the
   * phone second-guessing the newsroom with a number it computed on its own.
   *
   * None of it over a search: a result list has a first row, not a lead, and
   * stamping "Top story" on whatever matched is the interface asserting an
   * editorial judgement nobody made.
   */
  const leading = useMemo(
    () => (query.trim() ? [] : visible.slice(0, topStorySettings().count)),
    [query, visible],
  );
  const rows = useMemo(() => visible.slice(leading.length), [leading, visible]);

  const { width } = useWindowDimensions();

  /*
   * How far the list is dragged from its resting position.
   *
   * The desk change used to happen on release with no motion at all: the
   * headlines were simply different ones. That reads as a glitch rather than
   * as navigation, because nothing connects the gesture to the result. Moving
   * the list under the finger makes the swipe a physical thing — the reader
   * sees the page they are on leave and the next one arrive.
   */
  const tx = useSharedValue(0);

  const canGo = useCallback((delta: number) => adjacentDesk(section, delta) !== section, [section]);

  /*
   * Runs on the JS thread once the outgoing page has left the screen.
   *
   * Order matters: swap the desk first, then place the incoming page off the
   * far edge, then animate it in. Setting the offset after the state change
   * means the new list never paints at rest in the centre, which would show
   * as a one-frame flash of the destination before it slides in.
   */
  /*
   * `react-hooks/immutability` fires on every `tx.value = …` below.
   *
   * `tx` is a Reanimated shared value: assigning to `.value` *is* its API, and
   * these run on the UI thread inside gesture callbacks rather than during
   * render. The compiler has no model for that, so each write is suppressed
   * individually rather than the whole component opted out — a blanket
   * `"use no memo"` here would silently stop optimising the app's busiest
   * screen.
   */
  const commitDesk = useCallback(
    (delta: number, direction: number) => {
      setSection((current) => adjacentDesk(current, delta));
      // eslint-disable-next-line react-hooks/immutability
      tx.value = -direction * width;
      tx.value = withTiming(0, { duration: 190, easing: Easing.out(Easing.cubic) });
    },
    [tx, width],
  );

  const canNext = canGo(1);
  const canPrev = canGo(-1);

  /*
   * Horizontal swipe changes desk.
   *
   * `activeOffsetX` means the gesture only claims the touch once it is clearly
   * sideways, and `failOffsetY` hands it back the moment it is not — without
   * both, the pan competes with the list and vertical scrolling turns sticky,
   * which is a far worse trade than the convenience is worth.
   */
  const swipeDesks = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          const blocked = e.translationX < 0 ? !canNext : !canPrev;
          // At the ends the page still moves, but heavily damped. A drag that
          // does nothing at all feels broken; one that resists says "this is
          // the last desk" without a message.
          // eslint-disable-next-line react-hooks/immutability
          tx.value = e.translationX * (blocked ? 0.22 : 1);
        })
        .onEnd((e) => {
          const goingNext = e.translationX < 0;
          const delta = goingNext ? 1 : -1;
          const direction = goingNext ? -1 : 1;
          const far = Math.abs(e.translationX) > 64 || Math.abs(e.velocityX) > 550;

          if (far && (goingNext ? canNext : canPrev)) {
            // eslint-disable-next-line react-hooks/immutability
            tx.value = withTiming(
              direction * width,
              { duration: 140, easing: Easing.in(Easing.cubic) },
              (finished) => {
                if (finished) runOnJS(commitDesk)(delta, direction);
              },
            );
            return;
          }
          tx.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.6 });
        }),
    [canNext, canPrev, commitDesk, tx, width],
  );

  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const feedError = describeApiError(error, t, {
    title: t('feed.errorTitle'),
    body: t('feed.errorBody'),
  });

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
  /*
   * The masthead.
   *
   * Dark in both themes, carrying the logo, the controls and the desks — the
   * page below changes with the theme, the publication's own bar does not.
   */
  const chrome = (
    <View className="bg-masthead" style={{ paddingTop: insets.top }}>
      {/* The bar runs up behind the clock and battery, so those have to be
          light here — the app-wide default is dark, for the white page. */}
      <StatusBar style="light" />
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
        onOpenBusinesses={() => router.push('/organisations')}
      />
      <SectionTabs selected={section} onSelect={setSection} />
    </View>
  );

  if (isPending) return <FeedSkeleton />;

  if (isError) {
    return (
      <View className="flex-1 bg-canvas">
        {chrome}
        {/* The server's own reason where it has one — a maintenance window and
            a lost connection call for different things from the reader. */}
        <ErrorState
          title={feedError.title}
          description={feedError.body}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas-soft">
      {chrome}
      <GestureDetector gesture={swipeDesks}>
        <Animated.View className="flex-1" style={pageStyle}>
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            // Inset past the thumbnail rather than full-bleed. A rule running the
            // whole width reads as a table; one starting where the text starts
            // reads as a list of separate things.
            ItemSeparatorComponent={() => (
              <View style={{ marginLeft: 132, height: 1 }} className="bg-hairline/[0.07]" />
            )}
            /*
              The lead scrolls away with the list rather than pinning.
              It is a story, not chrome — the desks above it are the chrome, and
              those do stay.
            */
            ListHeaderComponent={
              leading.length > 0 ? (
                <>
                  <TopStories incidents={leading} onOpen={handleOpenDetail} />
                  {/* A full-width rule under the rotation, where the inset rule
                      between rows would read as though it were one. */}
                  <View className="h-2 bg-canvas-soft" />
                </>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
            showsVerticalScrollIndicator={false}
            onRefresh={() => void refetch()}
            refreshing={false}
            ListEmptyComponent={
              leading.length > 0 ? null : (
                <View className="pt-6">
                  <EmptyState
                    icon="search-outline"
                    title={t('feed.noMatchesTitle')}
                    description={t('feed.noMatchesBody')}
                  />
                </View>
              )
            }
            ListFooterComponent={
              visible.length > 0 ? (
                <Text variant="caption" tone="faint" className="py-6 text-center">
                  {t('feed.endOfFeed')}
                </Text>
              ) : null
            }
          />
        </Animated.View>
      </GestureDetector>

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
