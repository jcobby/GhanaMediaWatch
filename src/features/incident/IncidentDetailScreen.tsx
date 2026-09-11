import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorState, Glass, Pressable, Sheet, Skeleton, Text } from '@/components/ui';
import { useIncident, useToggleReaction } from '@/hooks/useIncidents';
import { categoryHue, useColors } from '@/lib/theme';
import { haversineMetres, regionContaining } from '@/lib/geo';
import { useViewerLocation } from '@/hooks/useViewerLocation';
import { formatCount, formatDistance } from '@/lib/format';
import { toast } from '@/stores/toastStore';
import { openDirections } from '@/lib/navigation';
import { shareIncident } from '@/lib/share';
import { CaptureStamp } from '@/components/CaptureStamp';
import { GnaHorizontal } from '@/components/Brand';
import { IncidentStage } from './IncidentStage';
import { CommentList } from '@/features/comments/CommentList';
import { CommentComposer } from '@/features/comments/CommentComposer';
import { useComments, useCommentsStore } from '@/stores/commentsStore';
import { useAuthStore } from '@/stores/authStore';
import type { IncidentComment } from '@/types/comments';

interface IncidentDetailScreenProps {
  incidentId: string;
}

/**
 * Full incident view — media, metadata, mini-map, and the navigation handoff.
 *
 * PHASE 5. Resolves from fixtures; moves behind the ApiClient with Phase 2.
 *
 * Every metadata row here is conditional on the value being present, because
 * the server nulls whatever the reporter suppressed. There is no "hidden" flag
 * to check and no placeholder to render — absence is the whole signal.
 */
export function IncidentDetailScreen({ incidentId }: IncidentDetailScreenProps) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const viewer = useViewerLocation();
  const comments = useComments(incidentId);
  const addComment = useCommentsStore((s) => s.add);
  const profile = useAuthStore((s) => s.profile);

  /*
   * Arriving from the feed's comment icon means the reader has already decided
   * to read the discussion, so jump them to it rather than making them scroll
   * the whole report first.
   */

  const [mapOpen, setMapOpen] = useState(false);
  // Arriving from the feed's comment icon opens straight onto them.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [commentsOpen, setCommentsOpen] = useState(focus === 'comments');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  /*
   * Whether the caption is actually longer than the space it gets.
   *
   * Measured rather than guessed from string length: the same character count
   * wraps to two lines or four depending on the device, and a "More" button
   * that opens nothing is worse than no button at all.
   */
  const [captionOverflows, setCaptionOverflows] = useState(false);
  /*
   * Whether the media failed to load.
   *
   * `expo-image` fails silently, so without this a report whose file the
   * server no longer holds is a black screen — indistinguishable from one still
   * loading, and from a report that genuinely has nothing to show.
   */
  const [mediaFailed, setMediaFailed] = useState(false);

  const { data: incident, isPending, isError, refetch } = useIncident(incidentId);
  const toggleReaction = useToggleReaction();
  const hue = incident ? categoryHue(incident.category) : c.textFaint;
  const { latitude, longitude } = incident?.location ?? { latitude: null, longitude: null };
  const hasCoords = latitude !== null && longitude !== null;

  /*
   * Narrowed on the discriminant itself.
   *
   * A derived boolean does not narrow a union, so `publisher.displayName`
   * would not typecheck through one — the anonymous variant has no such
   * field.
   */
  const publisherName =
    incident?.publisher.kind === 'anonymous'
      ? t('common.anonymous')
      : (incident?.publisher.displayName ?? '');

  const handleShare = useCallback(async () => {
    if (!incident) return;
    await shareIncident({
      reportId: incident.reportId,
      description: incident.description,
      referenceLine: t('feed.shareVerify', { id: incident.reportId }),
    });
  }, [incident, t]);

  const contributions = comments.filter((c) => c.isContribution && c.media !== null).length;

  /*
   * A comment attachment opens outside the report, and is never inlined.
   *
   * Comment media carries no vetting state, so playing it inside the report
   * would lend unreviewed footage the report's standing. It is also never put
   * through the share sheet: that would send a raw media URL to other people,
   * which is the one thing sharing must not do — see `shareIncident`.
   */
  const handleOpenCommentMedia = useCallback(
    (comment: IncidentComment) => {
      if (!comment.media) return;
      const url = comment.media.playbackUrl ?? comment.media.posterUrl;
      void Linking.openURL(url).catch(() => {
        toast.error(t('incident.attachmentUnavailable'), t('incident.attachmentUnavailableBody'));
      });
    },
    [t],
  );

  const handleReportAbuse = useCallback(() => {
    if (!incident) return;
    Alert.alert(t('detail.reportTitle'), t('detail.reportBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('detail.reportConfirm'),
        style: 'destructive',
        onPress: () => toast.success(t('detail.reportedTitle'), t('detail.reportedBody')),
      },
    ]);
  }, [incident, t]);

  const handleNavigate = useCallback(async () => {
    if (latitude === null || longitude === null) return;

    const outcome = await openDirections({
      latitude,
      longitude,
      label: incident?.location.label,
    });
    if (outcome === 'failed') {
      toast.error(t('detail.directionsFailedTitle'), t('detail.directionsFailedBody'));
    }
  }, [latitude, longitude, incident, t]);

  if (isPending) {
    return (
      <View className="flex-1 gap-4 bg-canvas p-4" style={{ paddingTop: insets.top + 16 }}>
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </View>
    );
  }

  if (isError || !incident) {
    return (
      <View className="flex-1 bg-canvas">
        <ErrorState
          title={t('detail.errorTitle')}
          description={t('common.unknownErrorHelp')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/*
        A real bar, so the report has a top edge.

        The footage used to run under the status bar with the back arrow
        floating on whatever frame happened to be behind it — dark on a night
        shot, invisible on a bright one, and never in a predictable place. Its
        own black band fixes all three, and matches the feed's masthead so
        opening a report does not feel like leaving the app.

        The duration sits here too rather than on the picture: it is a fact
        about the file, which is what a header is for.
      */}
      {/* A spacer does the distribution, so `justify-between` would fight it:
          with both, the gap lands in two places and the lockup drifts. */}
      <View
        className="flex-row items-center gap-2 bg-masthead px-2 py-1.5"
        style={{ paddingTop: insets.top + 6 }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-pill"
        >
          <Ionicons name="chevron-back" size={24} color={c.textOnDark} />
        </Pressable>

        <GnaHorizontal height={20} reversed />

        <View className="flex-1" />

        {incident.media.kind === 'video' ? (
          <View className="flex-row items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-1">
            <Ionicons name="play" size={10} color={c.textOnDark} />
            <Text variant="caption" onMedia className="font-sans-semibold">
              {incident.media.durationMs
                ? `${Math.round(incident.media.durationMs / 1000)}s`
                : t('feed.video')}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Stage ───────────────────────────────────────────────────────── */}
      {/*
        The footage, and everything that overlays it.

        `flex-1` rather than an absolute fill, so the media starts where the
        header ends. Category, publisher and comments are controls here rather
        than a column of text underneath — a report is a piece of footage
        first, and making the reader scroll past it to reach anything meant the
        thing they came for occupied a third of the screen.
      */}
      <View className="flex-1">
        {/*
          A missing file is said out loud, not left as a black screen.

          `expo-image` fails silently, so a report whose media the server no
          longer has looked identical to one still loading — a black rectangle
          with the caption sitting over it. That happens for a real reason worth
          distinguishing: on hosting with an ephemeral filesystem the database
          row survives a restart and the uploaded file does not, so `/media/{id}`
          answers 404 while every other detail of the report is intact.
        */}
        <IncidentStage incident={incident} failed={mediaFailed} onFailed={setMediaFailed} />

        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 340 }}
          pointerEvents="none"
        />

        {/*
          The decorative play button is gone.

          It was drawn over the stage with `pointerEvents="none"` — a control
          that looked like the way to start the video and could not be pressed,
          on top of a frame that never rendered because `expo-image` cannot
          decode an MP4. A reader tapped it, nothing happened, and there was
          nothing else to try. The player now has real transport controls.
        */}

        {/* ── Action rail ─────────────────────────────────────────────────── */}
        {/*
        Collapsed to a single control until asked for.

        Five stacked buttons down the right edge is the most furniture on the
        screen, and it sits on top of the one thing the reader opened the page
        to watch. Folding it away leaves the footage clear; the actions are one
        tap behind a button that stays in the same place, so nothing is lost
        except the clutter.
      */}
        <View
          className="absolute right-3 items-center gap-5"
          style={{ bottom: insets.bottom + 200 }}
        >
          {actionsOpen ? (
            <>
              <RailAction
                icon={incident.viewerHasReacted ? 'heart' : 'heart-outline'}
                tint={incident.viewerHasReacted ? c.live : c.textOnDark}
                label={formatCount(incident.counts.reactions)}
                onPress={() => toggleReaction(incident)}
                accessibilityLabel={t('feed.react')}
              />
              <RailAction
                icon="chatbubble-outline"
                tint={c.textOnDark}
                label={formatCount(comments.length)}
                onPress={() => setCommentsOpen(true)}
                accessibilityLabel={t('feed.comments')}
              />
              <RailAction
                icon="arrow-redo-outline"
                tint={c.textOnDark}
                label={t('feed.share')}
                onPress={() => void handleShare()}
                accessibilityLabel={t('feed.share')}
              />
              {hasCoords ? (
                <RailAction
                  icon="navigate"
                  tint={c.textOnDark}
                  label={t('detail.navigate')}
                  onPress={() => void handleNavigate()}
                  accessibilityLabel={t('detail.navigate')}
                />
              ) : null}
              <RailAction
                icon="flag-outline"
                tint={c.textOnDark}
                label={t('feed.reportAbuse')}
                onPress={handleReportAbuse}
                accessibilityLabel={t('feed.reportAbuse')}
              />
            </>
          ) : null}

          {/* The toggle keeps its position whether open or closed, so the thumb
            returns to the same place instead of hunting for a moved control. */}
          <Pressable
            onPress={() => setActionsOpen((open) => !open)}
            accessibilityLabel={t(actionsOpen ? 'detail.hideActions' : 'detail.actions')}
            accessibilityState={{ expanded: actionsOpen }}
          >
            <Glass
              context="media"
              elevation="mid"
              className="h-12 w-12 items-center justify-center rounded-pill"
            >
              <Ionicons
                name={actionsOpen ? 'close' : 'ellipsis-horizontal'}
                size={22}
                color={c.textOnDark}
              />
            </Glass>
          </Pressable>
        </View>

        {/* ── Caption ─────────────────────────────────────────────────────── */}
        {/*
          Lifted clear of the transport on a video.

          The native controls sit across the bottom of the player, which is
          exactly where this block was — and it is interactive, so it takes the
          taps meant for play, pause and the scrubber. It cannot simply be made
          non-interactive: the publisher's name opens their page.

          Moving it up is the fix that keeps both. A photo has no controls to
          clear, so it stays where it was and the frame is not wasted.
        */}
        <View
          className="absolute left-4 gap-2"
          style={{ bottom: insets.bottom + (incident.media.kind === 'video' ? 92 : 20), right: 76 }}
        >
          <Pressable
            onPress={() =>
              /*
               * Only a licensing institution has a directory page.
               *
               * The agency publishes its own copy under its own name, but it
               * is not a subscribing organisation and has no entry to open — a
               * tap would land on "not found".
               */
              incident.publisher.kind === 'organisation' && incident.origin === 'citizen_report'
                ? router.push(`/organisations/${incident.publisher.id}`)
                : undefined
            }
            haptic={false}
            accessibilityLabel={publisherName}
            className="flex-row items-center gap-2"
          >
            <View className="h-7 w-7 items-center justify-center rounded-pill bg-white/15">
              <Ionicons
                name={
                  incident.publisher.kind === 'anonymous'
                    ? 'eye-off-outline'
                    : incident.publisher.kind === 'organisation'
                      ? 'business'
                      : 'person'
                }
                size={13}
                color={c.textOnDark}
              />
            </View>
            <Text variant="body-sm" onMedia className="font-sans-semibold">
              {publisherName}
            </Text>
            {incident.publisher.kind === 'organisation' && incident.origin === 'citizen_report' ? (
              <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.7)" />
            ) : null}
          </Pressable>

          {/*
          Who filed it, when that is not who published it.

          An institution's name alone on a citizen's footage reads as though
          the institution shot it. The person who stood there keeps the credit
          — and this is the only place in the interface it can appear, because
          `publisher` is a union and has already dropped the name by the time
          an organisation is on it.
        */}
          {incident.publisher.kind === 'organisation' ? (
            <Text variant="caption" onMedia style={{ opacity: 0.75, marginTop: -2 }}>
              {t('detail.filedBy', {
                name:
                  incident.reporter.kind === 'anonymous'
                    ? t('common.anonymous')
                    : incident.reporter.displayName,
              })}
            </Text>
          ) : null}

          {/*
          Expanded, the caption scrolls inside a bounded box.

          A long eyewitness account runs to fifteen lines or more, and letting
          it grow freely would push it up over the footage until the report had
          covered the thing it describes. Capped at just over a third of the
          screen it stays a caption: the video is still visible behind it, and
          the rest of the words are a scroll away rather than a takeover.
        */}
          <ScrollView
            scrollEnabled={captionOpen}
            showsVerticalScrollIndicator={captionOpen}
            style={{ maxHeight: captionOpen ? screenH * 0.36 : undefined }}
            contentContainerStyle={{ flexGrow: 0 }}
          >
            <Text
              variant="body-sm"
              onMedia
              numberOfLines={captionOpen ? undefined : 3}
              onTextLayout={(e) => {
                // Fires with the real line boxes. Only meaningful while collapsed
                // — once expanded the count is the full text and would latch true.
                if (!captionOpen) setCaptionOverflows(e.nativeEvent.lines.length > 3);
              }}
              style={{ lineHeight: 20 }}
            >
              {incident.description}
            </Text>
          </ScrollView>

          {captionOverflows ? (
            <Pressable
              onPress={() => setCaptionOpen((open) => !open)}
              haptic={false}
              accessibilityRole="button"
              accessibilityState={{ expanded: captionOpen }}
              accessibilityLabel={t(captionOpen ? 'detail.showLess' : 'detail.showMore')}
              hitSlop={8}
              className="self-start"
            >
              <Text variant="caption" onMedia className="font-sans-semibold uppercase">
                {t(captionOpen ? 'detail.showLess' : 'detail.showMore')}
              </Text>
            </Pressable>
          ) : null}

          <CaptureStamp incident={incident} compact />
        </View>
      </View>

      {/* ── Comments ────────────────────────────────────────────────────── */}
      <Sheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        title={t('detail.comments')}
        subtitle={
          contributions > 0 ? t('detail.contributions', { count: contributions }) : undefined
        }
      >
        <View className="gap-3">
          <CommentComposer
            onSubmit={(draft) => {
              addComment(incidentId, draft, profile?.displayName ?? 'You');
              toast.success(t('comments.posted'), t('comments.postedBody'));
            }}
          />
          <CommentList comments={comments} onOpenMedia={handleOpenCommentMedia} />
        </View>
      </Sheet>

      {/* Route, on demand. Guarded on the coordinates rather than on `mapOpen`
          alone so the map body can narrow them — the sheet is only reachable
          when they exist, but the compiler cannot know that. */}
      {latitude !== null && longitude !== null ? (
        <Sheet
          visible={mapOpen}
          onClose={() => setMapOpen(false)}
          title={t('detail.navigate')}
          subtitle={incident.location.label ?? undefined}
        >
          <View className="gap-3">
            <View className="overflow-hidden rounded-lg">
              <MapView
                provider={PROVIDER_DEFAULT}
                style={{ height: 230 }}
                initialRegion={regionContaining(viewer.location, {
                  latitude,
                  longitude,
                })}
                showsUserLocation={viewer.isReal}
                showsMyLocationButton={false}
              >
                {/*
                 * A straight line, not a driving route. Real turn-by-turn
                 * geometry needs a directions provider and is a paid API call
                 * per request, so it belongs on the server — see
                 * API_CONTRACT.md. Until then the app is honest about what
                 * this line is, and hands off to the OS maps app for the
                 * actual route.
                 */}
                <Polyline
                  coordinates={[viewer.location, { latitude, longitude }]}
                  strokeColor={c.accent}
                  strokeWidth={3}
                  lineDashPattern={[8, 6]}
                />
                <Marker coordinate={viewer.location} tracksViewChanges={false}>
                  <View className="h-5 w-5 items-center justify-center rounded-pill border-2 border-white bg-accent-alt" />
                </Marker>
                <Marker coordinate={{ latitude, longitude }} tracksViewChanges={false}>
                  <View
                    style={{ backgroundColor: hue }}
                    className="h-7 w-7 items-center justify-center rounded-pill border-2 border-white"
                  >
                    <Ionicons name="alert" size={13} color={c.textOnDark} />
                  </View>
                </Marker>
              </MapView>
            </View>

            <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
              <View className="h-8 w-8 items-center justify-center rounded-pill bg-accent-wash">
                <Ionicons name="git-compare-outline" size={16} color={c.accent} />
              </View>
              <View className="flex-1">
                <Text variant="body-sm" className="font-sans-semibold">
                  {formatDistance(haversineMetres(viewer.location, { latitude, longitude }))}{' '}
                  {t('detail.straightLine').toLowerCase()}
                </Text>
                <Text variant="caption" tone="muted">
                  {viewer.isReal ? t('detail.fromYou') : t('detail.approxOrigin')}
                </Text>
              </View>
            </Glass>

            <Button
              label={t('detail.getDirections')}
              fullWidth
              onPress={() => void handleNavigate()}
              leading={<Ionicons name="navigate" size={16} color={c.textOnDark} />}
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * One control on the right-hand rail.
 *
 * Icon over a count, the arrangement every video app has settled on — it puts
 * the number where the thumb already is and costs almost no frame. The label
 * is not decoration: an unlabelled icon rail is unreadable to anyone who has
 * not used one before, and a flag icon in particular means nothing on its own.
 */
function RailAction({
  icon,
  tint,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel} className="items-center">
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-black/35">
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text variant="caption" onMedia className="mt-1 font-sans-medium">
        {label}
      </Text>
    </Pressable>
  );
}
