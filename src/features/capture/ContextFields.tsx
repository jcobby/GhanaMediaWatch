import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Glass, Pressable, SwitchRow, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { hapticSelect } from '@/lib/haptics';
import {
  EMERGENCY_NUMBER,
  SEVERITIES,
  SEVERITY_META,
  handlingRequirements,
  type ConsentFlags,
  type Severity,
} from '@/types/context';

/**
 * The questions that turn footage into an actionable report.
 *
 * Three pieces rather than one block, because the review is now in steps and
 * each belongs to a different one: how urgent sits with the description, the
 * landmark sits with where it is, and what is in the frame sits with what gets
 * published.
 */

/** How urgent — with the emergency warning the moment someone is in danger. */
export function SeverityField({
  severity,
  onSeverity,
}: {
  severity: Severity;
  onSeverity: (value: Severity) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const emergency = SEVERITY_META[severity].warnUseEmergencyServices;

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {t('review.severity')}
      </Text>
      <View className="flex-row gap-2">
        {SEVERITIES.map((level) => {
          const meta = SEVERITY_META[level];
          const selected = severity === level;
          return (
            <Pressable
              key={level}
              onPress={() => {
                hapticSelect();
                onSeverity(level);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={meta.label}
              className="flex-1"
            >
              <View
                className={
                  selected
                    ? 'items-center gap-1 rounded-md border-2 px-1.5 py-2.5'
                    : 'items-center gap-1 rounded-md border border-hairline/[0.10] px-1.5 py-2.5'
                }
                style={selected ? { borderColor: meta.hue, backgroundColor: `${meta.hue}14` } : null}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.hue }} />
                <Text
                  variant="caption"
                  className="text-center font-sans-semibold"
                  style={selected ? { color: meta.hue } : undefined}
                  numberOfLines={1}
                >
                  {meta.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" tone="muted">
        {SEVERITY_META[severity].hint}
      </Text>

      {/*
       * The most important warning in the app.
       *
       * Dawuro is not an emergency service. Someone filming instead of calling
       * for help is the worst outcome this product can produce, so this is loud
       * and appears the moment they say people are in danger.
       */}
      {emergency ? (
        <View className="flex-row items-start gap-2.5 rounded-md bg-danger-wash p-3">
          <Ionicons name="alert-circle" size={18} color={c.danger} />
          <View className="flex-1 gap-0.5">
            <Text variant="body-sm" tone="danger" className="font-sans-semibold">
              {t('review.emergencyTitle')}
            </Text>
            <Text variant="caption" tone="secondary">
              {t('review.emergencyBody', { number: EMERGENCY_NUMBER })}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A nearby name people actually use, when coordinates are not enough. */
export function LandmarkField({
  landmark,
  onLandmark,
}: {
  landmark: string;
  onLandmark: (value: string) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {t('review.landmark')}
      </Text>
      <Glass elevation="low" className="rounded-lg p-3">
        <TextInput
          value={landmark}
          onChangeText={onLandmark}
          placeholder={t('review.landmarkPlaceholder')}
          placeholderTextColor={c.textFaint}
          maxLength={80}
          accessibilityLabel={t('review.landmark')}
          style={{ color: c.textPrimary, fontFamily: 'Inter_400Regular', fontSize: 15, padding: 0 }}
        />
      </Glass>
      <Text variant="caption" tone="muted">
        {t('review.landmarkHelp')}
      </Text>
    </View>
  );
}

/** What is in the frame, which decides how the footage must be handled. */
export function ConsentFields({
  consent,
  onConsent,
}: {
  consent: ConsentFlags;
  onConsent: (key: keyof ConsentFlags, value: boolean) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const requirements = handlingRequirements(consent);

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {t('review.whatsInIt')}
      </Text>
      <Glass elevation="low" className="rounded-lg px-4">
        <SwitchRow
          label={t('review.publicPlace')}
          description={t('review.publicPlaceHelp')}
          value={consent.publicPlace}
          onValueChange={(v) => onConsent('publicPlace', v)}
        />
        <SwitchRow
          label={t('review.subjectsConsented')}
          description={t('review.subjectsConsentedHelp')}
          value={consent.subjectsConsented}
          onValueChange={(v) => onConsent('subjectsConsented', v)}
        />
        <SwitchRow
          label={t('review.containsMinors')}
          description={t('review.containsMinorsHelp')}
          value={consent.containsMinors}
          onValueChange={(v) => onConsent('containsMinors', v)}
        />
        <SwitchRow
          label={t('review.distressing')}
          description={t('review.distressingHelp')}
          value={consent.distressing}
          onValueChange={(v) => onConsent('distressing', v)}
        />
        <SwitchRow
          label={t('review.privateProperty')}
          description={t('review.privatePropertyHelp')}
          value={consent.showsPrivateProperty}
          onValueChange={(v) => onConsent('showsPrivateProperty', v)}
        />
      </Glass>

      {/* What their answers mean, said back before they send. */}
      {requirements.length > 0 ? (
        <View className="gap-1.5 rounded-md bg-warning-wash p-3">
          <Text variant="caption" tone="warning" className="font-sans-semibold">
            {t('review.handlingTitle')}
          </Text>
          {requirements.map((requirement) => (
            <View key={requirement} className="flex-row items-start gap-2">
              <Ionicons name="ellipse" size={5} color={c.warning} style={{ marginTop: 6 }} />
              <Text variant="caption" tone="secondary" className="flex-1">
                {t(`review.handling.${requirement}`)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
