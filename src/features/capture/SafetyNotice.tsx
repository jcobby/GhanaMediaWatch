import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Glass, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';

/**
 * What not to do while filming.
 *
 * Shown during the GPS wait rather than as a dialogue nobody reads. The gate
 * already costs a reporter several seconds with nothing to look at, and this is
 * the one moment they are certain to be holding the phone, about to film, and
 * not yet committed to anything.
 *
 * Worded as five plain instructions because that is how they will be recalled —
 * a paragraph of policy at the moment someone is walking toward a fire is not
 * read, and would not be remembered if it were.
 *
 * The emergency line comes first and is separated out. Every other rule is
 * about protecting the report; that one is about protecting a person.
 */
const RULES = ['dontRisk', 'dontTrespass', 'dontProvoke', 'dontObstruct', 'dontExpose'] as const;

export function SafetyNotice() {
  const c = useColors();
  const { t } = useTranslation();

  return (
    <Glass elevation="low" className="w-full gap-3 rounded-lg p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="shield-checkmark-outline" size={15} color={c.accent} />
        <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
          {t('safety.title')}
        </Text>
      </View>

      {/* The one rule that is about a person rather than a report. */}
      <View className="flex-row items-start gap-2.5 rounded-sm bg-danger-wash p-2.5">
        <Ionicons name="call-outline" size={15} color={c.danger} style={{ marginTop: 1 }} />
        <Text variant="caption" tone="secondary" className="flex-1">
          {t('safety.emergencyFirst')}
        </Text>
      </View>

      <View className="gap-2">
        {RULES.map((rule) => (
          <View key={rule} className="flex-row items-start gap-2.5">
            <Ionicons
              name="close-circle-outline"
              size={14}
              color={c.textMuted}
              style={{ marginTop: 1 }}
            />
            <Text variant="caption" tone="secondary" className="flex-1">
              {t(`safety.${rule}`)}
            </Text>
          </View>
        ))}
      </View>
    </Glass>
  );
}
