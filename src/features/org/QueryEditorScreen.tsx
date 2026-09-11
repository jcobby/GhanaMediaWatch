import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Glass, Pressable, SwitchRow, Text } from '@/components/ui';
import { SAVED_QUERIES } from '@/api/mockData';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '@/types/api';
import { categoryColor, useColors } from '@/lib/theme';
import { formatDistance } from '@/lib/format';
import { toast } from '@/stores/toastStore';

/** Radius stops, in metres. Discrete because a free slider invites false precision. */
const RADIUS_STOPS = [500, 1000, 2000, 3000, 5000, 10_000, 20_000] as const;

interface QueryEditorScreenProps {
  queryId?: string;
}

/**
 * Saved watch query editor — categories, keywords, and a geofence.
 *
 * The geofence is the reason this screen exists: an institution watches a
 * *place*, and a radius drawn on a map is the only honest way to express that.
 * The radius is stepped rather than continuously draggable — an org watching
 * "about 3 km around the Odaw" does not mean 2,847 m, and a free slider invites
 * a precision the underlying matching does not have.
 */
export function QueryEditorScreen({ queryId }: QueryEditorScreenProps) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const existing = SAVED_QUERIES.find((q) => q.id === queryId);

  const [name, setName] = useState(existing?.name ?? '');
  const [categories, setCategories] = useState<IncidentCategory[]>(existing?.categories ?? []);
  const [radiusIndex, setRadiusIndex] = useState(() => {
    const current = existing?.radiusM ?? 3000;
    const nearest = RADIUS_STOPS.reduce(
      (best, stop, i) =>
        Math.abs(stop - current) < Math.abs(RADIUS_STOPS[best]! - current) ? i : best,
      0,
    );
    return nearest;
  });
  const [alertsOn, setAlertsOn] = useState(existing?.alertsOn ?? true);
  const [center, setCenter] = useState({ latitude: 5.6037, longitude: -0.187 });

  const radiusM = RADIUS_STOPS[radiusIndex]!;

  // Keep the map framed to the circle as the radius changes, so the geofence
  // never grows beyond the visible region without the user noticing.
  const region = useMemo(() => {
    const delta = (radiusM / 111_000) * 3.2;
    return {
      ...center,
      latitudeDelta: Math.max(delta, 0.01),
      longitudeDelta: Math.max(delta, 0.01),
    };
  }, [center, radiusM]);

  const toggleCategory = (category: IncidentCategory) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error(t('org.nameRequiredTitle'), t('org.nameRequiredBody'));
      return;
    }
    if (categories.length === 0) {
      toast.error(t('org.categoryRequiredTitle'), t('org.categoryRequiredBody'));
      return;
    }
    toast.success(t('org.querySaved'), t('org.querySavedBody'));
    router.back();
  };

  /*
   * The keyboard covers the bottom of the screen, which is where a form's last
   * field and its submit button live. Every screen here that takes typed input
   * needs this; only the sign-in screens had it, so the rest hid the control
   * you were reaching for the moment you tapped to type.
   *
   * `padding` on iOS, matching the sign-in screens. Left unset on Android,
   * where the window resizing under `adjustResize` already does it — the
   * exception is a `Modal`, which that does not reach, and which `Sheet`
   * handles itself.
   */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        /*
          Without this the first tap while the keyboard is up only dismisses
          it, and the button under your finger does nothing — so every action
          on a form takes two taps and the first one looks broken.
        */
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }}
        contentContainerClassName="gap-5 px-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <Text variant="title-lg">{existing ? t('org.editQuery') : t('org.newQuery')}</Text>
        </View>

        {/* Name */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('org.queryName')}
          </Text>
          <Glass elevation="low" className="rounded-lg px-4">
            <TextField
              value={name}
              onChangeText={setName}
              placeholder={t('org.queryNamePlaceholder')}
              accessibilityLabel={t('org.queryName')}
            />
          </Glass>
        </View>

        {/* Geofence */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('org.watchArea')}
          </Text>
          <View className="overflow-hidden rounded-lg">
            <MapView
              provider={PROVIDER_DEFAULT}
              style={{ height: 240 }}
              region={region}
              onPress={(e) => setCenter(e.nativeEvent.coordinate)}
            >
              <Circle
                center={center}
                radius={radiusM}
                strokeColor={c.accent}
                strokeWidth={2}
                fillColor="rgba(91, 61, 245, 0.14)"
              />
              <Marker
                coordinate={center}
                draggable
                onDragEnd={(e) => setCenter(e.nativeEvent.coordinate)}
              >
                <View className="h-6 w-6 items-center justify-center rounded-pill border-2 border-white bg-accent">
                  <View className="h-1.5 w-1.5 rounded-pill bg-white" />
                </View>
              </Marker>
            </MapView>
          </View>
          <Text variant="caption" tone="muted">
            {t('org.mapHint')}
          </Text>

          <Glass elevation="low" className="gap-3 rounded-lg p-4">
            <View className="flex-row items-center justify-between">
              <Text variant="body-sm" tone="muted">
                {t('org.radius')}
              </Text>
              <Text variant="body" className="font-sans-semibold">
                {formatDistance(radiusM)}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setRadiusIndex((i) => Math.max(0, i - 1))}
                disabled={radiusIndex === 0}
                accessibilityLabel={t('org.smaller')}
                className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
              >
                <Ionicons name="remove" size={18} color={c.textPrimary} />
              </Pressable>
              <View className="h-1.5 flex-1 flex-row gap-1">
                {RADIUS_STOPS.map((stop, i) => (
                  <View
                    key={stop}
                    className={
                      i <= radiusIndex
                        ? 'h-1.5 flex-1 rounded-pill bg-accent'
                        : 'h-1.5 flex-1 rounded-pill bg-canvas-raise'
                    }
                  />
                ))}
              </View>
              <Pressable
                onPress={() => setRadiusIndex((i) => Math.min(RADIUS_STOPS.length - 1, i + 1))}
                disabled={radiusIndex === RADIUS_STOPS.length - 1}
                accessibilityLabel={t('org.larger')}
                className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
              >
                <Ionicons name="add" size={18} color={c.textPrimary} />
              </Pressable>
            </View>
          </Glass>
        </View>

        {/* Categories */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('org.categories')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {INCIDENT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(`category.${c}`)}
                dotColor={categoryColor[c]}
                selected={categories.includes(c)}
                onPress={() => toggleCategory(c)}
              />
            ))}
          </View>
        </View>

        {/* Alerts */}
        <Glass elevation="low" className="rounded-lg px-4">
          <SwitchRow
            label={t('org.pushAlerts')}
            description={t('org.pushAlertsHelp')}
            value={alertsOn}
            onValueChange={setAlertsOn}
          />
        </Glass>

        {/* The privacy rule that also binds paying customers. */}
        <View className="flex-row items-start gap-2">
          <Ionicons name="lock-closed-outline" size={13} color={c.textMuted} />
          <Text variant="caption" tone="muted" className="flex-1">
            {t('org.suppressedNote')}
          </Text>
        </View>
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button label={t('org.saveQuery')} size="lg" fullWidth onPress={handleSave} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Local input — the auth field carries its own label, which this layout supplies. */
function TextField(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}) {
  const c = useColors();
  return (
    <TextInput
      {...props}
      placeholderTextColor={c.textFaint}
      style={{
        height: 52,
        color: c.textPrimary,
        fontFamily: 'Inter_400Regular',
        fontSize: 16,
      }}
    />
  );
}
