import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, Glass, Pressable, Text } from '@/components/ui';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { categoryColor, colors } from '@/lib/theme';
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

/**
 * Map view — incidents plotted over Accra with category filters.
 *
 * PHASE 5. Reads the same fixtures as the feed, and deliberately reuses the
 * exact same filtering shape the API takes, so swapping in the real query layer
 * changes where the array comes from and nothing else.
 *
 * Incidents whose reporter suppressed location never appear here at all — a pin
 * on a map is a location disclosure, so they are filtered out before render.
 */
export function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<IncidentCategory | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const plottable = useMemo(
    () =>
      SAMPLE_INCIDENTS.filter((i) => i.location.latitude !== null && i.location.longitude !== null),
    [],
  );

  const visible = useMemo(
    () => (active ? plottable.filter((i) => i.category === active) : plottable),
    [plottable, active],
  );

  const categories = useMemo(
    () => Array.from(new Set(plottable.map((i) => i.category))),
    [plottable],
  );

  const selectedIncident = visible.find((i) => i.id === selected) ?? null;

  return (
    <View className="flex-1 bg-canvas">
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{
          latitude: 5.6037,
          longitude: -0.187,
          latitudeDelta: 0.22,
          longitudeDelta: 0.22,
        }}
      >
        {visible.map((incident) => (
          <Marker
            key={incident.id}
            coordinate={{
              latitude: incident.location.latitude!,
              longitude: incident.location.longitude!,
            }}
            onPress={() => setSelected(incident.id)}
            tracksViewChanges={false}
          >
            <View
              style={{ backgroundColor: categoryColor[incident.category] }}
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
          {categories.map((c) => (
            <Chip
              key={c}
              label={t(`category.${c}`)}
              dotColor={categoryColor[c]}
              selected={active === c}
              onPress={() => setActive(active === c ? null : c)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Tap-to-preview card */}
      {selectedIncident ? (
        <View className="absolute left-4 right-4" style={{ bottom: insets.bottom + 88 }}>
          <Pressable
            onPress={() => router.push(`/incident/${selectedIncident.id}`)}
            accessibilityLabel={t('map.openIncident')}
            accessibilityRole="button"
          >
            <Glass elevation="high" className="rounded-lg p-4">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: categoryColor[selectedIncident.category],
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
                    <Ionicons name="chevron-forward" size={12} color={colors.accent} />
                  </View>
                </View>
                <Pressable
                  onPress={() => setSelected(null)}
                  accessibilityLabel={t('common.close')}
                  className="h-8 w-8 items-center justify-center rounded-pill bg-glass/[0.14]"
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            </Glass>
          </Pressable>
        </View>
      ) : (
        <View
          className="absolute left-4 right-4 items-center"
          style={{ bottom: insets.bottom + 88 }}
        >
          <Glass elevation="low" className="rounded-pill px-4 py-2">
            <Text variant="caption" tone="muted">
              {t('map.hint', { count: visible.length })}
            </Text>
          </Glass>
        </View>
      )}
    </View>
  );
}
