import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/lib/theme';
import { formatCoordinates, formatExactCapture } from '@/lib/format';
import { usePlaceName } from '@/hooks/usePlaceName';
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

  /*
   * A name for the fix, asked of the phone's own geocoder.
   *
   * Before the early return below, because it is a hook. Null until it answers,
   * and null forever where it cannot — the fallback chain below covers both.
   */
  const resolved = usePlaceName(incident.location.latitude, incident.location.longitude);

  /*
   * Agency copy gets a dateline, never a capture stamp.
   *
   * "Captured" is a claim about a specific act: a person, at that place, at
   * that moment, with the GPS gate satisfied. A wire story about a summit in
   * Abuja has none of that behind it, and printing the word on one borrows the
   * credibility the platform builds for footage that does.
   */
  if (incident.origin === 'newsroom') {
    const dateline = incident.location.label;
    if (!dateline) return null;
    return (
      <View className="flex-row items-center gap-1.5" pointerEvents="none">
        <Ionicons name="newspaper-outline" size={compact ? 11 : 13} color={colors.textOnDark} />
        <Text variant="caption" onMedia className="font-sans-medium">
          {dateline}
        </Text>
      </View>
    );
  }

  const when = formatExactCapture(incident.capturedAtIso, incident.capturedAtPrecision);

  /*
   * The name of the place, or the fix that stands in for it.
   *
   * `location.label` is null on everything the service holds — it resolves no
   * place names — while the coordinates it was derived from are right there on
   * the same object. So the stamp printed a time and nothing else on footage
   * whose entire claim is that it was taken *here*, and the reader had no way
   * to tell that from a reporter who had withheld the location.
   *
   * Those two must not look alike, and this is what keeps them apart: a
   * suppressed location arrives with no coordinates either, so it still falls
   * through to nothing and the withholding stays unadvertised.
   */
  const where =
    incident.location.label ??
    resolved ??
    formatCoordinates(incident.location.latitude, incident.location.longitude);

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
