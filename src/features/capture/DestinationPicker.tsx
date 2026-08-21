import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Glass, Pressable, Sheet, Text } from '@/components/ui';
import { BUSINESSES } from '@/api/dawuroData';
import { colors } from '@/lib/theme';
import { estimateCommission } from '@/features/earnings/commission';
import { formatCedis, type SubmissionDestination } from '@/types/dawuro';
import type { IncidentCategory } from '@/types/api';

interface DestinationPickerProps {
  destination: SubmissionDestination;
  onChange: (destination: SubmissionDestination) => void;
  selectedBusinessIds: string[];
  onChangeBusinesses: (ids: string[]) => void;
  category: IncidentCategory;
  mediaKind: 'photo' | 'video';
  locationConfidence: 'high' | 'low';
}

const OPTIONS: {
  value: SubmissionDestination;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'public', icon: 'globe-outline' },
  { value: 'marketplace', icon: 'briefcase-outline' },
  { value: 'directed', icon: 'send-outline' },
  { value: 'both', icon: 'layers-outline' },
];

/**
 * Where a report goes — the decision that splits the two halves of the product.
 *
 * A reporter can publish to the public feed, offer the report to subscribing
 * businesses, send it to named institutions only, or both. The earnings figure
 * updates as they choose, because a payment model people cannot see before they
 * commit is one they will not trust.
 *
 * The estimate uses the same function the ledger uses, so what is shown here
 * cannot quietly disagree with what is eventually paid.
 */
export function DestinationPicker({
  destination,
  onChange,
  selectedBusinessIds,
  onChangeBusinesses,
  category,
  mediaKind,
  locationConfidence,
}: DestinationPickerProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const estimate = useMemo(
    () =>
      estimateCommission({
        category,
        destination,
        mediaKind,
        locationConfidence,
        licensedBy: destination === 'directed' ? Math.max(1, selectedBusinessIds.length) : 1,
      }),
    [category, destination, mediaKind, locationConfidence, selectedBusinessIds.length],
  );

  const needsBusinesses = destination === 'directed';
  const selected = BUSINESSES.filter((b) => selectedBusinessIds.includes(b.id));

  const toggleBusiness = (id: string) => {
    onChangeBusinesses(
      selectedBusinessIds.includes(id)
        ? selectedBusinessIds.filter((b) => b !== id)
        : [...selectedBusinessIds, id],
    );
  };

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {t('destination.label')}
      </Text>

      <View className="gap-2">
        {OPTIONS.map((option) => {
          const active = destination === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(`destination.${option.value}.title`)}
            >
              <Glass
                elevation="low"
                raised={active}
                className={
                  active
                    ? 'flex-row items-center gap-3 rounded-lg border border-accent p-3.5'
                    : 'flex-row items-center gap-3 rounded-lg p-3.5'
                }
              >
                <View
                  className={
                    active
                      ? 'h-10 w-10 items-center justify-center rounded-pill bg-accent'
                      : 'h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise'
                  }
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={active ? colors.textOnDark : colors.textMuted}
                  />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="body" className="font-sans-semibold">
                    {t(`destination.${option.value}.title`)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t(`destination.${option.value}.body`)}
                  </Text>
                </View>
                <View
                  className={
                    active
                      ? 'h-5 w-5 items-center justify-center rounded-pill bg-accent'
                      : 'h-5 w-5 rounded-pill border border-hairline/25'
                  }
                >
                  {active ? (
                    <Ionicons name="checkmark" size={12} color={colors.textOnDark} />
                  ) : null}
                </View>
              </Glass>
            </Pressable>
          );
        })}
      </View>

      {/* Named recipients, for a directed submission */}
      {needsBusinesses ? (
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityLabel={t('destination.chooseBusinesses')}
        >
          <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
            <Ionicons name="business-outline" size={18} color={colors.accent} />
            <View className="flex-1">
              <Text variant="body-sm" className="font-sans-semibold">
                {selected.length > 0
                  ? selected.map((b) => b.name).join(', ')
                  : t('destination.chooseBusinesses')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('destination.recipientCount', { count: selected.length })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
          </Glass>
        </Pressable>
      ) : null}

      {/* Earnings estimate */}
      <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-success-wash">
          <Ionicons name="cash-outline" size={18} color={colors.success} />
        </View>
        <View className="flex-1">
          <Text variant="body" className="font-sans-semibold">
            {estimate.reporterPesewas > 0
              ? t('destination.estimatedEarning', {
                  amount: formatCedis(estimate.reporterPesewas),
                })
              : t('destination.noEarning')}
          </Text>
          <Text variant="caption" tone="muted">
            {estimate.reporterPesewas > 0
              ? t('destination.earningHelp')
              : t('destination.noEarningHelp')}
          </Text>
        </View>
      </Glass>

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('destination.chooseBusinesses')}
        subtitle={t('destination.chooseBusinessesHelp')}
      >
        <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            {BUSINESSES.filter((b) => b.subscriptionStatus === 'active').map((business) => {
              const isSelected = selectedBusinessIds.includes(business.id);
              // Businesses whose declared interests match earn a hint — a
              // reporter should not have to guess who wants a flood report.
              const relevant = business.interests.includes(category);
              return (
                <Pressable
                  key={business.id}
                  onPress={() => toggleBusiness(business.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={business.name}
                  className={
                    isSelected
                      ? 'flex-row items-center gap-3 rounded-lg border border-accent bg-accent-wash p-3'
                      : 'flex-row items-center gap-3 rounded-lg border border-hairline/[0.10] p-3'
                  }
                >
                  <View className="h-9 w-9 items-center justify-center rounded-pill bg-canvas-raise">
                    <Ionicons name="business" size={15} color={colors.textMuted} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text variant="body-sm" className="font-sans-semibold">
                        {business.name}
                      </Text>
                      {business.verified ? (
                        <Ionicons name="checkmark-circle" size={13} color={colors.info} />
                      ) : null}
                    </View>
                    <Text variant="caption" tone={relevant ? 'success' : 'muted'}>
                      {relevant
                        ? t('destination.interestedIn', { category: t(`category.${category}`) })
                        : t(`sector.${business.sector}`)}
                    </Text>
                  </View>
                  <View
                    className={
                      isSelected
                        ? 'h-5 w-5 items-center justify-center rounded-pill bg-accent'
                        : 'h-5 w-5 rounded-pill border border-hairline/25'
                    }
                  >
                    {isSelected ? (
                      <Ionicons name="checkmark" size={12} color={colors.textOnDark} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}
