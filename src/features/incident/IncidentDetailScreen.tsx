import { useCallback, useRef, useState } from 'react';
import { Alert, Dimensions, Linking, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  ErrorState,
  Glass,
  Pressable,
  Sheet,
  Skeleton,
  Text,
} from '@/components/ui';
import { useIncident, useToggleReaction } from '@/hooks/useIncidents';
import { categoryColor, useColors } from '@/lib/theme';
import { haversineMetres, regionContaining } from '@/lib/geo';
import { useViewerLocation } from '@/hooks/useViewerLocation';
import { formatCount, formatDistance } from '@/lib/format';
import { toast } from '@/stores/toastStore';
import { openDirections } from '@/lib/navigation';
import { shareIncident } from '@/lib/share';
import { CaptureStamp } from '@/components/CaptureStamp';
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
  const { width } = Dimensions.get('window');
  const viewer = useViewerLocation();
  const comments = useComments(incidentId);
  const addComment = useCommentsStore((s) => s.add);
  const profile = useAuthStore((s) => s.profile);

  /*
   * Arriving from the feed's comment icon means the reader has already decided
   * to read the discussion, so jump them to it rather than making them scroll
   * the whole report first.
   */
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const commentsY = useRef(0);
  const jumped = useRef(false);

  const [mapOpen, setMapOpen] = useState(false);

  const { data: incident, isPending, isError, refetch } = useIncident(incidentId);
  const toggleReaction = useToggleReaction();
  const hue = incident ? categoryColor[incident.category] : c.textFaint;
  const { latitude, longitude } = incident?.location ?? { latitude: null, longitude: null };
  const hasCoords = latitude !== null && longitude !== null;

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
    <View className="flex-1 bg-canvas">
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* Media */}
        <View style={{ height: width * 1.15 }} className="bg-canvas-raise">
          <Image
            source={{ uri: incident.media.url }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            transition={220}
            accessibilityLabel={incident.description}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
            pointerEvents="none"
          />

          {/* Provenance, stamped on the frame rather than captioned beside it —
              this footage is meant to travel, and the claim has to travel with
              it. */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 130 }}
            pointerEvents="none"
          />
          <View className="absolute bottom-3 left-4 right-4">
            <CaptureStamp incident={incident} />
          </View>

          <View
            className="absolute left-4 right-4 flex-row items-center justify-between"
            style={{ top: insets.top + 8 }}
          >
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel={t('common.back')}
              className="h-10 w-10 items-center justify-center rounded-pill"
            >
              <Glass
                context="media"
                elevation="mid"
                className="h-10 w-10 items-center justify-center rounded-pill"
              >
                <Ionicons name="chevron-back" size={20} color={c.textOnDark} />
              </Glass>
            </Pressable>

            {incident.media.kind === 'video' ? (
              <Glass
                context="media"
                elevation="low"
                className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5"
              >
                <Ionicons name="play" size={11} color={c.textOnDark} />
                <Text variant="caption" onMedia className="font-sans-semibold">
                  {incident.media.durationMs
                    ? `${Math.round(incident.media.durationMs / 1000)}s`
                    : t('feed.video')}
                </Text>
              </Glass>
            ) : null}
          </View>

          {incident.media.kind === 'video' ? (
            <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
              <Glass
                context="media"
                elevation="high"
                className="h-16 w-16 items-center justify-center rounded-pill"
              >
                <Ionicons name="play" size={26} color={c.textOnDark} />
              </Glass>
            </View>
          ) : null}
        </View>

        {/* Body */}
        <View className="gap-4 px-4 pt-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <View
              className="flex-row items-center gap-2 rounded-pill px-3 py-1.5"
              style={{ backgroundColor: `${hue}1A` }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: hue }} />
              <Text
                variant="caption"
                className="font-sans-semibold uppercase"
                style={{ color: hue }}
              >
                {t(`category.${incident.category}`)}
              </Text>
            </View>
            <Badge label={t(`vetting.${incident.vettingState}`)} tone="success" />
            {incident.location.confidence === 'low' ? (
              <Badge label={t('capture.reducedAccuracyBadge')} tone="warning" />
            ) : null}
          </View>

          <Text variant="title-lg">{incident.description}</Text>

          {/* Reporter + engagement */}
          <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-pill bg-accent-wash">
              <Ionicons
                name={
                  incident.publisher.kind === 'anonymous'
                    ? 'eye-off-outline'
                    : incident.publisher.kind === 'organisation'
                      ? 'business'
                      : 'person'
                }
                size={16}
                color={c.accent}
              />
            </View>
            <View className="flex-1">
              <Text variant="body-sm" className="font-sans-semibold">
                {incident.publisher.kind === 'anonymous'
                  ? t('common.anonymous')
                  : incident.publisher.displayName}
              </Text>
              <Text variant="caption" tone="muted">
                {formatCount(incident.counts.reactions)} {t('feed.react').toLowerCase()} ·{' '}
                {formatCount(incident.counts.comments)} {t('feed.comments').toLowerCase()}
              </Text>
            </View>
            {/* The route lives behind this button rather than inline. A map is
                the tallest thing on the screen and almost nobody needs it, but
                everybody scrolls past it to reach the discussion. */}
            {hasCoords ? (
              <Pressable
                onPress={() => setMapOpen(true)}
                accessibilityLabel={t('detail.getDirections')}
                className="h-10 flex-row items-center gap-1.5 rounded-pill bg-accent px-3"
              >
                <Ionicons name="navigate" size={14} color={c.textOnDark} />
                <Text variant="caption" className="font-sans-semibold text-white">
                  {t('detail.navigate')}
                </Text>
              </Pressable>
            ) : null}
          </Glass>

          {/* Location suppressed — say so plainly rather than leaving a gap */}
          {!hasCoords ? (
            <Glass elevation="low" className="flex-row items-start gap-3 rounded-lg p-3.5">
              <Ionicons name="eye-off-outline" size={17} color={c.textMuted} />
              <Text variant="body-sm" tone="muted" className="flex-1">
                {t('detail.locationHidden')}
              </Text>
            </Glass>
          ) : null}

          <View className="flex-row gap-3">
            <Button
              label={t('feed.react')}
              variant="glass"
              className="flex-1"
              onPress={() => toggleReaction(incident)}
              accessibilityState={{ selected: incident.viewerHasReacted }}
              leading={
                <Ionicons
                  name={incident.viewerHasReacted ? 'heart' : 'heart-outline'}
                  size={15}
                  color={incident.viewerHasReacted ? c.live : c.textPrimary}
                />
              }
            />
            <Button
              label={t('feed.share')}
              variant="glass"
              className="flex-1"
              onPress={() => void handleShare()}
              leading={<Ionicons name="share-outline" size={15} color={c.textPrimary} />}
            />
            <Button
              label={t('feed.reportAbuse')}
              variant="glass"
              className="flex-1"
              onPress={handleReportAbuse}
              leading={<Ionicons name="flag-outline" size={15} color={c.textPrimary} />}
            />
          </View>

          {/* Discussion */}
          <View
            className="gap-3 border-t border-hairline/[0.07] pt-5"
            onLayout={(e) => {
              commentsY.current = e.nativeEvent.layout.y;
              if (focus === 'comments' && !jumped.current) {
                jumped.current = true;
                // Without the frame delay the ScrollView has not yet sized its
                // content and the scroll is clamped to the current height.
                requestAnimationFrame(() =>
                  scrollRef.current?.scrollTo({ y: commentsY.current, animated: false }),
                );
              }
            }}
          >
            <View className="flex-row items-baseline justify-between">
              <Text variant="title-sm">{t('comments.title')}</Text>
              {contributions > 0 ? (
                <Text variant="caption" tone="accent" className="font-sans-semibold">
                  {t('comments.contributionsHelp', { count: contributions })}
                </Text>
              ) : null}
            </View>

            <CommentComposer
              onSubmit={(draft) => {
                addComment(incidentId, draft, profile?.displayName ?? 'You');
                toast.success(t('comments.posted'), t('comments.postedBody'));
              }}
            />

            <CommentList comments={comments} onOpenMedia={handleOpenCommentMedia} />
          </View>
        </View>
      </ScrollView>

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
