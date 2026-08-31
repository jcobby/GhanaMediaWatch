import { Linking, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Badge, Button, Glass, Text } from '@/components/ui';
import { GPS_ACCURACY_THRESHOLD_M } from '@/lib/constants';
import { colors } from '@/lib/theme';
import { formatCoordinate } from '@/lib/format';
import { CameraStage } from './CameraStage';
import { AcquisitionRing } from './AcquisitionRing';
import { SafetyNotice } from './SafetyNotice';
import { canOfferReducedAccuracy } from './gpsGate';
import { useGpsGate } from './useGpsGate';

/**
 * The capture route — the GPS gate, then the camera.
 *
 * The gate is a hard precondition, not a warning: `CameraStage` is not rendered
 * at all until `status.kind === 'ready'`, so the preview cannot mount without a
 * coordinate good enough to dispatch someone to.
 */
export function CaptureScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status, fix, acceptReducedAccuracy, retryPermission } = useGpsGate(true);

  if (status.kind === 'ready') {
    return (
      <Animated.View entering={FadeIn.duration(260)} className="flex-1">
        <CameraStage
          fix={status.fix}
          confidence={status.confidence}
          accuracyM={status.fix.accuracyM}
        />
      </Animated.View>
    );
  }

  if (status.kind === 'permission_denied') {
    return (
      <GateMessage
        icon="location-outline"
        title={t('capture.permissionDeniedTitle')}
        body={t('capture.permissionDeniedBody')}
        actionLabel={t('capture.openSettings')}
        onAction={() => {
          void Linking.openSettings();
          retryPermission();
        }}
      />
    );
  }

  if (status.kind === 'services_disabled') {
    return (
      <GateMessage
        icon="navigate-circle-outline"
        title={t('capture.servicesDisabledTitle')}
        body={t('capture.servicesDisabledBody')}
        actionLabel={t('capture.openSettings')}
        onAction={() => void Linking.openSettings()}
      />
    );
  }

  const stalled = status.kind === 'stalled';

  return (
    /* Scrollable now that the safety guidance sits here. Centred while it
       fits, scrollable when it does not — on a small phone the rules must not
       be the part that falls off the bottom. */
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="grow items-center justify-center px-8"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <AcquisitionRing accuracyM={status.accuracyM} />

      <View className="mt-9 items-center gap-3">
        <Text variant="title-lg" className="text-center">
          {stalled ? t('capture.stalledTitle') : t('capture.acquiringTitle')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {stalled ? t('capture.stalledBody') : t('capture.acquiringBody')}
        </Text>
        <Badge
          label={t('capture.accuracyTarget', { threshold: GPS_ACCURACY_THRESHOLD_M })}
          tone={stalled ? 'warning' : 'accent'}
        />
      </View>

      <Glass elevation="low" className="mt-8 w-full gap-2.5 rounded-lg p-4">
        <Row label={t('capture.latitude')} value={formatCoordinate(fix?.latitude ?? null) ?? '—'} />
        <Row
          label={t('capture.longitude')}
          value={formatCoordinate(fix?.longitude ?? null) ?? '—'}
        />
        <Row label={t('capture.accuracy')} value={fix ? `±${Math.round(fix.accuracyM)} m` : '—'} />
        {fix?.isMocked ? (
          <View className="mt-1 flex-row items-center gap-2 rounded-sm bg-warning-wash p-2.5">
            <Ionicons name="warning-outline" size={15} color={colors.warning} />
            <Text variant="caption" tone="warning" className="flex-1">
              {t('capture.mockedBody')}
            </Text>
          </View>
        ) : null}
      </Glass>

      {/* The wait is the one moment a reporter is certainly holding the phone,
          about to film, and not yet committed to anything. */}
      <View className="mt-4 w-full">
        <SafetyNotice />
      </View>

      {/* The escape hatch flags the report rather than silently downgrading it. */}
      {canOfferReducedAccuracy(status, fix) ? (
        <Button
          label={t('capture.proceedReduced')}
          variant="glass"
          fullWidth
          className="mt-4"
          onPress={acceptReducedAccuracy}
        />
      ) : null}
    </ScrollView>
  );
}

function GateMessage({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
      <View className="h-16 w-16 items-center justify-center rounded-pill bg-accent-wash">
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Text variant="title-md" className="text-center">
        {title}
      </Text>
      <Text variant="body" tone="muted" className="text-center">
        {body}
      </Text>
      <Button label={actionLabel} onPress={onAction} className="mt-2" />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="caption" tone="muted" className="uppercase">
        {label}
      </Text>
      <Text variant="body-sm" className="font-sans-medium">
        {value}
      </Text>
    </View>
  );
}
