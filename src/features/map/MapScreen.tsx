import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, Glass, Pressable, Text } from '@/components/ui';
import { useIncident, useMapData } from '@/hooks/useIncidents';
import { categoryColor, categoryHue, useColors } from '@/lib/theme';
import { formatDistance, formatRelativeTime } from '@/lib/format';
import type { IncidentCategory } from '@/types/api';

/** Dark map styling. Google Maps takes JSON, not a stylesheet. */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#12121a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#08080d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#22222e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1626' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

const INITIAL_REGION: Region = {
  latitude: 5.6037,
  longitude: -0.187,
  latitudeDelta: 0.22,
  longitudeDelta: 0.22,
};

/**
 * How long panning has to settle before the map asks the service again.
 *
 * A drag fires `onRegionChangeComplete` repeatedly as fingers leave the glass;
 * querying on each would put a request in flight for every twitch and can trip
 * the service's rate limit on a single enthusiastic scroll.
 */
const SETTLE_MS = 300;

/** `west,south,east,north` — the order `GET /incidents/map` expects. */
function bboxOf(region: Region): string {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return [west, south, east, north].map((n) => n.toFixed(5)).join(',');
}

/**
 * Map view — what has been reported, where, over the visible ground.
 *
 * **Plotted from the clustered endpoint, not from the feed.** It used to draw
 * pins from `useFeed`, which is a page of reports: at fixture volume that page
 * *was* the dataset so the map looked right, and with real data panning to
 * Kumasi showed nothing — not because nothing had been reported there, but
 * because those reports were not in the loaded page. A map is read as evidence;
 * somebody points at an empty district and concludes it is quiet.
 *
 * The objection that kept it on the feed was real but soluble: clustered points
 * carry no description or capture time, and the card that opens on a tap needs
 * both. `MapMarker` carries an `id`, so a tapped pin fetches its own report —
 * one request, for the one report somebody asked to see, rather than holding
 * every description in memory against the chance of a tap.
 *
 * Incidents whose reporter suppressed location never reach this screen at all:
 * the service omits them, because a pin is a location disclosure.
 */
export function MapScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const [active, setActive] = useState<IncidentCategory | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [bbox, setBbox] = useState(() => bboxOf(INITIAL_REGION));

  /*
   * The visible ground, once it has stopped moving.
   *
   * Cleared on unmount so a pending timer cannot call `setBbox` on a screen that
   * has gone — the classic "state update on an unmounted component" leak, which
   * on this screen would fire every time somebody pans and then hits back.
   */
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const handleRegionSettled = useCallback((region: Region) => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setBbox(bboxOf(region)), SETTLE_MS);
  }, []);

  /*
   * Queried without a category, and filtered below.
   *
   * Passing the chip into the query would refetch on every filter change and,
   * worse, rebuild the chip row from the filtered answer — so choosing one
   * category would hide the others and there would be no way back to them.
   * Markers carry their own category, so one query serves every chip.
   */
  const { data, isPending, isError } = useMapData(bbox);
  const markers = useMemo(() => data?.markers ?? [], [data]);
  const clusters = useMemo(() => data?.clusters ?? [], [data]);

  const visible = useMemo(
    () => (active ? markers.filter((m) => m.category === active) : markers),
    [markers, active],
  );

  const categories = useMemo(
    () => Array.from(new Set(markers.map((m) => m.category))),
    [markers],
  );

  /*
   * The tapped pin's own report.
   *
   * Idle until something is selected. This is what makes the clustered endpoint
   * usable at all: the card needs a description and a capture time, and rather
   * than keep the whole feed in memory for them, the one report somebody asked
   * to see is fetched when they ask.
   */
  const detail = useIncident(selected ?? '');
  const selectedIncident = selected ? (detail.data ?? null) : null;

  /** Reports on screen, counting the ones folded into clusters. */
  const shown = useMemo(
    () => visible.length + clusters.reduce((total, cluster) => total + cluster.count, 0),
    [visible, clusters],
  );

  const nothingHere = !isPending && !isError && markers.length === 0 && clusters.length === 0;

  return (
    <View className="flex-1 bg-canvas">
      <MapView
        ref={map}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={handleRegionSettled}
      >
        {/*
          Clusters first, so a single pin is never drawn underneath one.

          Tapping zooms rather than opening anything: a cluster is several
          reports, and picking one of them on the reader's behalf would be the
          map making an editorial choice.
        */}
        {clusters.map((cluster) => (
          <Marker
            key={`cluster:${cluster.latitude},${cluster.longitude}`}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            accessibilityLabel={t('map.cluster', { count: cluster.count })}
            onPress={() =>
              map.current?.animateToRegion(
                {
                  latitude: cluster.latitude,
                  longitude: cluster.longitude,
                  latitudeDelta: 0.06,
                  longitudeDelta: 0.06,
                },
                350,
              )
            }
            tracksViewChanges={false}
          >
            <View
              style={{ backgroundColor: categoryHue(cluster.categories[0] ?? 'other') }}
              className="h-9 min-w-9 items-center justify-center rounded-pill border-2 border-hairline/70 px-1.5"
            >
              <Text variant="caption" onMedia className="font-sans-semibold">
                {cluster.count}
              </Text>
            </View>
          </Marker>
        ))}

        {visible.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            onPress={() => setSelected(marker.id)}
            tracksViewChanges={false}
          >
            <View
              style={{ backgroundColor: categoryHue(marker.category) }}
              className="h-6 w-6 items-center justify-center rounded-pill border-2 border-hairline/70"
            >
              <View className="h-1.5 w-1.5 rounded-pill bg-glass" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Filter rail */}
      <View className="absolute left-0 right-0" style={{ top: insets.top + 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4"
        >
          <Chip label={t('map.all')} selected={active === null} onPress={() => setActive(null)} />
          {categories.map((category) => (
            <Chip
              key={category}
              label={t(`category.${category}`)}
              dotColor={categoryColor[category]}
              selected={active === category}
              onPress={() => setActive(active === category ? null : category)}
            />
          ))}
        </ScrollView>
      </View>

      {/*
        An empty map is ambiguous, so it says which kind of empty it is.

        Ghana with no pins looks identical whether nothing has been published,
        the phone is offline, or the answer has not arrived — and only one of
        those means there is nothing happening. Now that the query follows the
        viewport, there is a fourth: nothing reported *here*, which is a real
        answer about this ground rather than about the archive.
      */}
      {isPending || isError || nothingHere ? (
        <View className="absolute left-4 right-4" style={{ top: insets.top + 76 }}>
          <Glass elevation="high" className="rounded-lg px-4 py-3">
            <Text variant="body-sm" className="text-center">
              {isPending
                ? t('map.loading')
                : isError
                  ? t('map.unavailableTitle')
                  : t('map.emptyHereTitle')}
            </Text>
            {!isPending ? (
              <Text variant="caption" tone="muted" className="mt-1 text-center">
                {isError ? t('map.unavailableBody') : t('map.emptyHereBody')}
              </Text>
            ) : null}
          </Glass>
        </View>
      ) : null}

      {/* Tap-to-preview card */}
      {selected ? (
        <View className="absolute left-4 right-4" style={{ bottom: insets.bottom + 88 }}>
          <Glass elevation="high" className="rounded-lg p-4">
            {detail.isPending ? (
              <Text variant="body-sm" tone="muted" className="py-2 text-center">
                {t('map.loadingIncident')}
              </Text>
            ) : !selectedIncident ? (
              /* The pin is real; the report behind it could not be read. Saying
                 so beats a card that silently never fills in. */
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="body-sm" tone="muted" className="flex-1">
                  {t('map.incidentUnavailable')}
                </Text>
                <Pressable
                  onPress={() => setSelected(null)}
                  accessibilityLabel={t('common.close')}
                  className="h-8 w-8 items-center justify-center rounded-pill bg-glass/[0.14]"
                >
                  <Ionicons name="close" size={16} color={c.textMuted} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => router.push(`/incident/${selectedIncident.id}`)}
                accessibilityLabel={t('map.openIncident')}
                accessibilityRole="button"
              >
                <View className="flex-row items-start gap-3">
                  <View className="flex-1 gap-1.5">
                    <View className="flex-row items-center gap-2">
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: categoryHue(selectedIncident.category),
                        }}
                      />
                      <Text variant="caption" tone="muted" className="uppercase">
                        {t(`category.${selectedIncident.category}`)}
                      </Text>
                      {selectedIncident.capturedAtIso ? (
                        <Text variant="caption" tone="faint">
                          · {formatRelativeTime(selectedIncident.capturedAtIso)}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="body-sm" numberOfLines={2}>
                      {selectedIncident.description}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {[
                        selectedIncident.location.label,
                        selectedIncident.distanceM !== undefined
                          ? formatDistance(selectedIncident.distanceM)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-1">
                      <Text variant="caption" tone="accent" className="font-sans-semibold">
                        {t('map.openIncident')}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color={c.accent} />
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setSelected(null)}
                    accessibilityLabel={t('common.close')}
                    className="h-8 w-8 items-center justify-center rounded-pill bg-glass/[0.14]"
                  >
                    <Ionicons name="close" size={16} color={c.textMuted} />
                  </Pressable>
                </View>
              </Pressable>
            )}
          </Glass>
        </View>
      ) : (
        <View
          className="absolute left-4 right-4 items-center"
          style={{ bottom: insets.bottom + 88 }}
        >
          <Glass elevation="low" className="rounded-pill px-4 py-2">
            <Text variant="caption" tone="muted">
              {t('map.hint', { count: shown })}
            </Text>
          </Glass>
        </View>
      )}
    </View>
  );
}
