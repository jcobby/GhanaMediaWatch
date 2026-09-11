import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { useColors } from '@/lib/theme';
import { estimateCommission } from '@/features/earnings/commission';
import { formatCedis, type SubmissionDestination } from '@/types/dawuro';
import type { IncidentCategory, MediaKind } from '@/types/api';

interface DestinationPickerProps {
  destination: SubmissionDestination;
  onChange: (destination: SubmissionDestination) => void;
  selectedOrganisationIds: string[];
  onChangeBusinesses: (ids: string[]) => void;
  category: IncidentCategory;
  mediaKind: MediaKind;
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
 * organisations, send it to named institutions only, or both. The earnings figure
 * updates as they choose, because a payment model people cannot see before they
 * commit is one they will not trust.
 *
 * The estimate uses the same function the ledger uses, so what is shown here
 * cannot quietly disagree with what is eventually paid.
 */
export function DestinationPicker({
  destination,
  onChange,
  selectedOrganisationIds,
  onChangeBusinesses,
  category,
  mediaKind,
  locationConfidence,
}: DestinationPickerProps) {
  const c = useColors();
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const estimate = useMemo(
    () =>
      estimateCommission({
        category,
        destination,
        mediaKind,
        locationConfidence,
        licensedBy: destination === 'directed' ? Math.max(1, selectedOrganisationIds.length) : 1,
      }),
    [category, destination, mediaKind, locationConfidence, selectedOrganisationIds.length],
  );

  /*
   * The real directory.
   *
   * This list used to be a fixture, so a reporter choosing "send to named
   * institutions" picked from organisations that are not on the platform — and
   * the report went to nobody. Where the directory is empty or cannot be read,
   * the sheet says so rather than offering names.
   */
  const {
    data: directory,
    isPending: directoryPending,
    isError: directoryFailed,
  } = useOrganisations();
  const available = receiving(directory);

  /*
   * Whether anyone can license a report at all.
   *
   * Three of the four choices below — offer to organisations, send to named
   * organisations, both — depend on an organisation existing to receive it. No
   * organisation has joined the platform yet, so those three currently route a
   * report to nobody while the screen quotes a commission for it.
   *
   * Promising money is the part that matters. Somebody films something at real
   * risk because a screen said it could earn them seven cedis; if nothing can
   * license it, that was never true and they find out weeks later, if ever.
   */
  const nobodyIsBuying = !directoryPending && !directoryFailed && available.length === 0;

  const needsBusinesses = destination === 'directed';
  const selected = available.filter((b) => selectedOrganisationIds.includes(b.id));

  const toggleOrganisation = (id: string) => {
    onChangeBusinesses(
      selectedOrganisationIds.includes(id)
        ? selectedOrganisationIds.filter((b) => b !== id)
        : [...selectedOrganisationIds, id],
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
          /*
           * Three of the four need an organisation to exist.
           *
           * They are shown rather than hidden — they are the product, and a
           * reporter should understand that footage can be sold — but marked,
           * because a choice that silently does nothing is worse than one that
           * explains itself. Choosing one still works: the report is filed and
           * waits, rather than being quietly dropped.
           */
          const inert = nobodyIsBuying && option.value !== 'public';
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
                    color={active ? c.textOnDark : c.textMuted}
                  />
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text variant="body" className="font-sans-semibold">
                      {t(`destination.${option.value}.title`)}
                    </Text>
                    {inert ? (
                      <Badge label={t('destination.notAvailableYet')} tone="warning" />
                    ) : null}
                  </View>
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
                  {active ? <Ionicons name="checkmark" size={12} color={c.textOnDark} /> : null}
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
          accessibilityLabel={t('destination.chooseOrganisations')}
        >
          <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
            <Ionicons name="business-outline" size={18} color={c.accent} />
            <View className="flex-1">
              <Text variant="body-sm" className="font-sans-semibold">
                {selected.length > 0
                  ? selected.map((b) => b.name).join(', ')
                  : t('destination.chooseOrganisations')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('destination.recipientCount', { count: selected.length })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
          </Glass>
        </Pressable>
      ) : null}

      {/* Earnings estimate */}
      <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-success-wash">
          <Ionicons name="cash-outline" size={18} color={c.success} />
        </View>
        <View className="flex-1">
          <Text variant="body" className="font-sans-semibold">
            {nobodyIsBuying
              ? t('destination.nobodyBuyingTitle')
              : estimate.reporterPesewas > 0
                ? t('destination.estimatedEarning', {
                    amount: formatCedis(estimate.reporterPesewas),
                  })
                : t('destination.noEarning')}
          </Text>
          <Text variant="caption" tone="muted">
            {nobodyIsBuying
              ? t('destination.nobodyBuyingHelp')
              : estimate.reporterPesewas > 0
                ? t('destination.earningHelp')
                : t('destination.noEarningHelp')}
          </Text>
        </View>
      </Glass>

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('destination.chooseOrganisations')}
        subtitle={t('destination.chooseOrganisationsHelp')}
      >
        <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            {/*
              Three answers, kept apart.

              "Still loading", "we could not ask" and "there is nobody to send
              to" mean different things to somebody deciding where their footage
              goes, and only the last one means they should choose a different
              destination. Rendering all three as an empty sheet — which is what
              a bare `.map` over an empty array does — tells them nothing.
            */}
            {directoryPending ? (
              <Text variant="body-sm" tone="muted" className="py-6 text-center">
                {t('destination.loadingOrganisations')}
              </Text>
            ) : directoryFailed ? (
              <View className="gap-1 py-6">
                <Text variant="body-sm" className="text-center">
                  {t('destination.directoryFailedTitle')}
                </Text>
                <Text variant="caption" tone="muted" className="text-center">
                  {t('destination.directoryFailedBody')}
                </Text>
              </View>
            ) : available.length === 0 ? (
              <View className="gap-1 py-6">
                <Text variant="body-sm" className="text-center">
                  {t('destination.noOrganisationsTitle')}
                </Text>
                <Text variant="caption" tone="muted" className="text-center">
                  {t('destination.noOrganisationsBody')}
                </Text>
              </View>
            ) : null}

            {available.map((organisation) => {
              const isSelected = selectedOrganisationIds.includes(organisation.id);
              /*
                No "matches your report" hint, because the phone cannot know.

                This read `organisation.interests` to mark organisations whose
                declared categories matched — but the public directory does not
                send interests, so the field was always undefined and the hint
                never appeared for anyone. Reading it as an empty list is the
                same answer with less pretence.

                Restoring the hint needs `interests` on `GET /organisations`,
                which is requested of the backend. Until then a reporter picks
                by name and sector, which is what the endpoint gives them.
              */
              const relevant = false;
              return (
                <Pressable
                  key={organisation.id}
                  onPress={() => toggleOrganisation(organisation.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={organisation.name}
                  className={
                    isSelected
                      ? 'flex-row items-center gap-3 rounded-lg border border-accent bg-accent-wash p-3'
                      : 'flex-row items-center gap-3 rounded-lg border border-hairline/[0.10] p-3'
                  }
                >
                  <View className="h-9 w-9 items-center justify-center rounded-pill bg-canvas-raise">
                    <Ionicons name="business" size={15} color={c.textMuted} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text variant="body-sm" className="font-sans-semibold">
                        {organisation.name}
                      </Text>
                      {organisation.verified ? (
                        <Ionicons name="checkmark-circle" size={13} color={c.info} />
                      ) : null}
                    </View>
                    <Text variant="caption" tone={relevant ? 'success' : 'muted'}>
                      {relevant
                        ? t('destination.interestedIn', { category: t(`category.${category}`) })
                        : t(`sector.${organisation.sector}`)}
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
                      <Ionicons name="checkmark" size={12} color={c.textOnDark} />
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
