import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/lib/theme';
import { formatExactCapture } from '@/lib/format';
import type { Incident } from '@/types/api';

/**
 * Capture time and place, stamped onto the footage.
 *
 * This is provenance, not decoration. A caption sitting beside a video is
 * separated from it the moment the file is downloaded, forwarded or
 * screenshotted — and this footage is meant to travel: to a newsroom, to an
 * agency, into an inbox someone acts on. Keeping the claim on the frame keeps
 * it attached to the evidence.
 *
 * The reporter's privacy choices are already applied by the time an Incident
 * exists: `capturedAtIso` is null when they hid the date, `location.label` is
 * null when they hid the place. Redaction happens before the data is built, not
 * here, so this cannot leak something a reporter withheld even by accident.
 * Hidden fields are absent rather than replaced with a placeholder, which would
 * advertise that something was withheld.
 *
 * The stamp burned into the *file* is a separate, server-side job at encode
 * time. This one is the on-screen version; neither replaces the other.
 */
export function CaptureStamp({
  incident,
  compact,
}: {
  incident: Incident;
  /** Tighter type for a thumbnail rather than a full-bleed player. */
  compact?: boolean;
}) {
  const { t } = useTranslation();

  const when = formatExactCapture(incident.capturedAtIso, incident.capturedAtPrecision);
  const where = incident.location.label;

  if (!when && !where) return null;

  const size = compact ? 11 : 13;

  return (
    <View className="gap-1" pointerEvents="none">
      {when ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={size} color={colors.textOnDark} />
          <Text
            variant="caption"
            onMedia
            className={compact ? 'font-sans-medium' : 'font-sans-semibold'}
          >
            {t('detail.capturedAt', { value: when })}
          </Text>
        </View>
      ) : null}
      {where ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="location" size={size} color={colors.textOnDark} />
          <Text
            variant="caption"
            onMedia
            className={compact ? 'font-sans-medium' : 'font-sans-semibold'}
            numberOfLines={1}
          >
            {where}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
