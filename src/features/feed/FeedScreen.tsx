import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, useWindowDimensions, View } from 'react-native';
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
import { EmptyState, ErrorState, Pressable, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useFeed, useOrganisationFeed } from '@/hooks/useIncidents';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { useOrganisationSurveys } from '@/hooks/useSurveys';
import { About, SurveyList } from '@/features/organisations/OrganisationProfileScreen';
import { FeedRow } from './FeedRow';
import { TopStories } from './TopStories';
import { useTopStorySettings } from './topStorySettings';
import { FeedBar } from './FeedBar';
import { SearchOverlay } from './SearchOverlay';
import { InstitutionsOverlay } from './InstitutionsOverlay';
import { SectionTabs } from './SectionTabs';
import { adjacentDesk, type NewsSection } from '@/types/sections';
import { describeApiError } from '@/lib/apiErrorCopy';
import { SlidesViewer } from './SlidesViewer';
import { FeedSkeleton } from './FeedSkeleton';
import type { Incident } from '@/types/api';
import type { DirectoryOrganisation } from '@/types/dawuro';

type OrganisationTab = 'reports' | 'surveys' | 'about';

/**
 * The public feed — GNA's homepage, or one organisation's.
 *
 * A scrolling list of cards on a light ground, not a full-screen pager: people
 * read this feed to answer questions, and those need several reports visible at
 * once.
 *
 * **Search is a screen, not furniture.** The bar carries one search icon; it
 * opens `SearchOverlay`, which searches reports and organisations in one place.
 * Choosing an organisation there turns this screen into that organisation's
 * homepage — its logo, its reports, its surveys — with a back arrow to GNA.
 */
export function FeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const feed = useFeed({ limit: 20 });
  const [organisation, setOrganisation] = useState<DirectoryOrganisation | null>(null);
  const [organisationTab, setOrganisationTab] = useState<OrganisationTab>('reports');
  const organisationFeed = useOrganisationFeed(organisation?.id ?? null);
  const organisationSurveys = useOrganisationSurveys(organisation?.id ?? null);
  const active = organisation ? organisationFeed : feed;

  const {
    data: directory,
    isPending: directoryPending,
    isError: directoryFailed,
  } = useOrganisations();
  // Only organisations the platform has approved can be opened from home.
  const approved = useMemo(() => receiving(directory), [directory]);
  /*
   * Two buttons, two screens, two pieces of state.
   *
   * These were one overlay with tabs, so the bar's single magnifier opened a
   * search that might be about reports or about institutions and made the
   * reader choose after arriving. They are separate questions and never open
   * together.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  const [institutionsOpen, setInstitutionsOpen] = useState(false);

  const incidents = useMemo(
    () => (organisation ? (organisationFeed.data ?? []) : (feed.data?.items ?? [])),
    [organisation, organisationFeed.data, feed.data],
  );
  const surveys = useMemo(
    () => (organisationSurveys.data ?? []).filter((survey) => survey.status !== 'draft'),
    [organisationSurveys.data],
  );

  const [slidesFrom, setSlidesFrom] = useState<number | null>(null);
  const [section, setSection] = useState<NewsSection | null>(null);

  const enterOrganisation = useCallback((next: DirectoryOrganisation | null) => {
    setOrganisation(next);
    setOrganisationTab('reports');
    // Each homepage starts clean: GNA's desk does not carry over.
    setSection(null);
  }, []);

  /*
   * Android's back button leaves an organisation's homepage before it leaves
   * the app — the same as the arrow in the bar.
   */
  useEffect(() => {
    if (!organisation) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      enterOrganisation(null);
      return true;
    });
    return () => subscription.remove();
  }, [organisation, enterOrganisation]);

  const visible = useMemo(
    () =>
      incidents.filter((incident) => {
        if (!organisation && section && incident.section !== section) return false;
        return true;
      }),
    [incidents, organisation, section],
  );

  /*
   * The top stories, and everything after them.
   *
   * How many is the desk's decision, from the platform settings; the stories
   * are the top of the order the server returned.
   */
  const { count: topStoryCount } = useTopStorySettings();
  const leading = useMemo(() => visible.slice(0, topStoryCount), [visible, topStoryCount]);
  const rows = useMemo(() => visible.slice(leading.length), [leading, visible]);

  const { width } = useWindowDimensions();

  /* How far the list is dragged, so a desk swipe is a physical movement. */
  const tx = useSharedValue(0);

  const canGo = useCallback((delta: number) => adjacentDesk(section, delta) !== section, [section]);

  /*
   * `react-hooks/immutability` fires on every `tx.value = …` below: assigning to
   * `.value` is a Reanimated shared value's API, on the UI thread, so each write
   * is suppressed individually.
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

  /* Horizontal swipe changes desk — on GNA's homepage only, where there are desks. */
  const swipeDesks = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!organisation)
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          const blocked = e.translationX < 0 ? !canNext : !canPrev;
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
    [organisation, canNext, canPrev, commitDesk, tx, width],
  );

  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const feedError = describeApiError(active.error, t, {
    title: organisation
      ? t('feed.organisationErrorTitle', { name: organisation.name })
      : t('feed.errorTitle'),
    body: t('feed.errorBody'),
  });

  const handleOpenDetail = useCallback(
    (incident: Incident) => router.push(`/incident/${incident.id}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Incident }) => <FeedRow incident={item} onOpen={handleOpenDetail} />,
    [handleOpenDetail],
  );

  /*
   * The masthead, pinned rather than scrolled. Dark in both themes, carrying
   * the lockup, one search icon, and GNA's desks — or an organisation's own tabs.
   */
  const chrome = (
    <View className="bg-masthead" style={{ paddingTop: insets.top }}>
      <StatusBar style="light" />
      <FeedBar
        onOpenSearch={() => setSearchOpen(true)}
        onOpenInstitutions={() => setInstitutionsOpen(true)}
        onOpenMap={() => router.push('/map')}
        onOpenSlides={() => setSlidesFrom(0)}
        onOpenBusinesses={() => router.push('/organisations')}
        organisation={organisation}
        onExitOrganisation={() => enterOrganisation(null)}
      />
      {organisation ? (
        <View className="flex-row px-2">
          {(['reports', 'surveys', 'about'] as const).map((tab) => {
            const on = organisationTab === tab;
            const label =
              tab === 'reports'
                ? t('feed.orgTabReports')
                : tab === 'surveys'
                  ? `${t('feed.orgTabSurveys')}${surveys.length ? ` (${surveys.length})` : ''}`
                  : t('feed.orgTabAbout');
            return (
              <Pressable
                key={tab}
                onPress={() => setOrganisationTab(tab)}
                haptic={false}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className="flex-1 items-center pb-2.5 pt-1"
              >
                <Text
                  onMedia
                  className={on ? 'font-sans-semibold' : 'font-sans-medium'}
                  style={{ fontSize: 14, opacity: on ? 1 : 0.65 }}
                >
                  {label}
                </Text>
                <View
                  className="absolute bottom-0 left-6 right-6 rounded-t-pill"
                  style={{ height: 2.5, backgroundColor: on ? '#FFFFFF' : 'transparent' }}
                />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <SectionTabs selected={section} onSelect={setSection} />
      )}
    </View>
  );

  const search = (
    <>
      {searchOpen ? (
        <SearchOverlay
          /*
            Scoped to an organisation's own reports on its homepage; null on
            GNA's, where the overlay fetches a wider page than the feed's twenty
            rather than searching whatever happens to be on screen.
          */
          organisationIncidents={organisation ? incidents : null}
          onOpenIncident={handleOpenDetail}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
      {institutionsOpen ? (
        <InstitutionsOverlay
          organisations={approved}
          loading={directoryPending}
          failed={directoryFailed}
          onOpenOrganisation={(id) => enterOrganisation(approved.find((o) => o.id === id) ?? null)}
          onClose={() => setInstitutionsOpen(false)}
        />
      ) : null}
    </>
  );

  // The skeleton only for GNA's first load; an organisation's page keeps its bar.
  if (!organisation && feed.isPending) return <FeedSkeleton />;

  /* An organisation's surveys or its About page, in place of the report list. */
  if (organisation && organisationTab !== 'reports') {
    return (
      <View className="flex-1 bg-canvas">
        {chrome}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
        >
          {organisationTab === 'surveys' ? (
            organisationSurveys.isPending ? (
              <Text variant="body-sm" tone="muted" className="py-10 text-center">
                {t('feed.loadingOrganisationSurveys')}
              </Text>
            ) : (
              <SurveyList surveys={surveys} onOpen={(survey) => router.push(`/surveys/${survey.id}`)} />
            )
          ) : (
            <About organisation={organisation} />
          )}
        </ScrollView>
        {search}
      </View>
    );
  }

  if (active.isError) {
    return (
      <View className="flex-1 bg-canvas">
        {chrome}
        {/* The server's own reason where it has one. */}
        <ErrorState
          title={feedError.title}
          description={feedError.body}
          retryLabel={t('common.retry')}
          onRetry={() => void active.refetch()}
        />
        {search}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {chrome}
      <GestureDetector gesture={swipeDesks}>
        {/* Keyed on whose homepage it is, so switching starts at the top. */}
        <Animated.View key={organisation?.id ?? 'gna'} className="flex-1" style={pageStyle}>
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            /* The lead scrolls away with the list; the masthead is the chrome. */
            ListHeaderComponent={
              leading.length > 0 ? (
                <>
                  {/* Keyed on the desk, so a new desk starts on its first story. */}
                  <TopStories
                    key={section ?? 'latest'}
                    incidents={leading}
                    onOpen={handleOpenDetail}
                  />
                  <View className="h-2 bg-canvas-soft" />
                </>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
            showsVerticalScrollIndicator={false}
            onRefresh={() => void active.refetch()}
            refreshing={false}
            ListEmptyComponent={
              leading.length > 0 ? null : (
                <View className="pt-6">
                  {organisation && organisationFeed.isPending ? (
                    <Text variant="body-sm" tone="muted" className="py-10 text-center">
                      {t('feed.loadingOrganisationFeed')}
                    </Text>
                  ) : organisation ? (
                    <EmptyState
                      icon="newspaper-outline"
                      title={t('feed.organisationEmptyTitle', { name: organisation.name })}
                      description={t('feed.organisationEmptyBody')}
                    />
                  ) : (
                    <EmptyState
                      icon="search-outline"
                      title={t('feed.noMatchesTitle')}
                      description={t('feed.noMatchesBody')}
                    />
                  )}
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

      {search}
    </View>
  );
}
