import { useCallback } from 'react';
import { Alert, Dimensions, Linking, Platform, ScrollView, Share, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ErrorState, Glass, Pressable, Skeleton, Text } from '@/components/ui';
import { useIncident } from '@/hooks/useIncidents';
import { categoryColor, colors } from '@/lib/theme';
import { haversineMetres, regionContaining } from '@/lib/geo';
import { useViewerLocation } from '@/hooks/useViewerLocation';
import {
  formatCoordinate,
  formatCount,
  formatDistance,
  formatFullTimestamp,
  formatRelativeTime,
} from '@/lib/format';
import { toast } from '@/stores/toastStore';

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
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const viewer = useViewerLocation();

  const { data: incident, isPending, isError, refetch } = useIncident(incidentId);
  const hue = incident ? categoryColor[incident.category] : colors.textFaint;
  const { latitude, longitude, label } = incident?.location ?? {
    latitude: null,
    longitude: null,
    label: null,
  };
  const hasCoords = latitude !== null && longitude !== null;
  const fullTimestamp = incident
    ? formatFullTimestamp(incident.capturedAtIso, incident.capturedAtPrecision)
    : null;

  /*
   * Sharing sends the incident's public link, never the media file: the file
   * may be restricted, and a report's shareability is a property of the report,
   * not of whoever happens to be looking at it.
   */
  const handleShare = useCallback(async () => {
    if (!incident) return;
    try {
      await Share.share({
        message: `${incident.description}\n\nhttps://dawuro.gh/i/${incident.id}`,
        ...(Platform.OS === 'ios' ? { url: `https://dawuro.gh/i/${incident.id}` } : {}),
      });
    } catch {
      // The user dismissing the share sheet is not an error worth surfacing.
    }
  }, [incident]);

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
    if (!hasCoords) return;
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
  }, [hasCoords, latitude, longitude]);

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
                <Ionicons name="chevron-back" size={20} color={colors.textOnDark} />
              </Glass>
            </Pressable>

            {incident.media.kind === 'video' ? (
              <Glass
                context="media"
                elevation="low"
                className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5"
              >
                <Ionicons name="play" size={11} color={colors.textOnDark} />
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
                <Ionicons name="play" size={26} color={colors.textOnDark} />
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
                name={incident.publisher.kind === 'anonymous' ? 'eye-off-outline' : 'person'}
                size={16}
                color={colors.accent}
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
          </Glass>

          {/* Metadata — each row appears only if the value survived the flags */}
          <Glass elevation="low" className="gap-0 rounded-lg">
            {fullTimestamp ? (
              <MetaRow icon="calendar-outline" label={t('detail.captured')} value={fullTimestamp} />
            ) : null}
            {incident.capturedAtIso && incident.capturedAtPrecision === 'exact' ? (
              <MetaRow
                icon="time-outline"
                label={t('detail.elapsed')}
                value={t('detail.ago', { time: formatRelativeTime(incident.capturedAtIso) })}
              />
            ) : null}
            {label ? (
              <MetaRow icon="location-outline" label={t('detail.place')} value={label} />
            ) : null}
            {incident.distanceM !== undefined ? (
              <MetaRow
                icon="walk-outline"
                label={t('detail.distance')}
                value={formatDistance(incident.distanceM)}
              />
            ) : null}
            {hasCoords ? (
              <MetaRow
                icon="navigate-circle-outline"
                label={t('detail.coordinates')}
                value={`${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`}
                last
              />
            ) : null}
          </Glass>

          {/* Location suppressed — say so plainly rather than leaving a gap */}
          {!hasCoords ? (
            <Glass elevation="low" className="flex-row items-start gap-3 rounded-lg p-3.5">
              <Ionicons name="eye-off-outline" size={17} color={colors.textMuted} />
              <Text variant="body-sm" tone="muted" className="flex-1">
                {t('detail.locationHidden')}
              </Text>
            </Glass>
          ) : null}

          {/* Route map — where you are, where the incident is */}
          {hasCoords ? (
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
                    strokeColor={colors.accent}
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
                      <Ionicons name="alert" size={13} color={colors.textOnDark} />
                    </View>
                  </Marker>
                </MapView>
              </View>

              <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
                <View className="h-8 w-8 items-center justify-center rounded-pill bg-accent-wash">
                  <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
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
                onPress={handleNavigate}
                leading={<Ionicons name="navigate" size={16} color={colors.textOnDark} />}
              />
            </View>
          ) : null}

          <View className="flex-row gap-3">
            <Button
              label={t('feed.share')}
              variant="glass"
              className="flex-1"
              onPress={() => void handleShare()}
              leading={<Ionicons name="share-outline" size={15} color={colors.textPrimary} />}
            />
            <Button
              label={t('feed.reportAbuse')}
              variant="glass"
              className="flex-1"
              onPress={handleReportAbuse}
              leading={<Ionicons name="flag-outline" size={15} color={colors.textPrimary} />}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function MetaRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={
        last
          ? 'flex-row items-center gap-3 px-4 py-3'
          : 'flex-row items-center gap-3 border-b border-hairline/[0.07] px-4 py-3'
      }
    >
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text variant="body-sm" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="body-sm" className="font-sans-medium">
        {value}
      </Text>
    </View>
  );
}
