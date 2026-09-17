import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Glass, Text } from '@/components/ui';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { useColors } from '@/lib/theme';
import { bestOffer, estimateCommission, sanitiseOffer } from '@/features/earnings/commission';
import { useCommissionRates } from '@/features/earnings/commissionRates';
import { formatCedis, type SubmissionDestination } from '@/types/dawuro';
import type { IncidentCategory, MediaKind } from '@/types/api';

interface EarningsEstimateProps {
  category: IncidentCategory;
  destination: SubmissionDestination;
  mediaKind: MediaKind;
  locationConfidence: 'high' | 'low';
  /** The organisations a directed report is being sent to, as chosen so far. */
  selectedOrganisationIds: string[];
}

/**
 * What this report could earn, shown beside the choice that decides it.
 *
 * Lifted out of `DestinationPicker` because the two no longer belong on the same
 * step. Recipients used to be picked inline beside the four destination options,
 * so the figure moved as they were ticked. Splitting recipients onto a step of
 * their own broke that quietly: the card stayed behind on step three, where
 * `selectedOrganisationIds` is still empty, and two separate parts of the
 * calculation collapsed to their floor —
 *
 *   - `licensedBy` fell to 1, so the per-extra-licensee uplift multiplied by
 *     exactly one however many newsrooms were later named;
 *   - `bestOffer` had nothing to search, so an organisation's higher rate for
 *     this category was ignored entirely.
 *
 * Nothing failed. The estimate was still correct for the inputs it was given —
 * the inputs simply had not been chosen yet — so a reporter decided whether to
 * send a report directly on a number that was always too low, and only ever too
 * low. Under-promising is not the safe direction here: it argues against the
 * choice the product is trying to make worth their while.
 *
 * So the figure now follows the decision. `DestinationPicker` renders this for
 * every destination that has no recipients to wait for; the review screen renders
 * it on the recipients step, under the list, where each tick changes it.
 */
export function EarningsEstimate({
  category,
  destination,
  mediaKind,
  locationConfidence,
  selectedOrganisationIds,
}: EarningsEstimateProps) {
  const c = useColors();
  const { t } = useTranslation();

  /*
   * The rates the platform set, served to the phone — the built-in rates until
   * they arrive.
   */
  const rates = useCommissionRates();

  /*
   * The same live directory the picker reads, from the same cached query, so
   * asking here costs no extra request and cannot disagree with the list of
   * organisations a reporter was just offered.
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
   * Promising money is the part that matters. Somebody films something at real
   * risk because a screen said it could earn them seven cedis; if no organisation
   * can license it, that was never true and they find out weeks later, if ever.
   *
   * A failed fetch is not an empty platform: "could not load organisations" and
   * "no organisation has joined" mean opposite things, and treating the first as
   * the second tells somebody their report cannot earn when it might.
   */
  const nobodyIsBuying = !directoryPending && !directoryFailed && available.length === 0;

  const selected = available.filter((b) => selectedOrganisationIds.includes(b.id));

  /*
   * An organisation's own higher rate, when the report goes only to organisations
   * that offer one. The best of the chosen organisations' offers — each can only
   * raise the figure, never lower it below the platform rate.
   */
  const offerPesewas =
    destination === 'directed'
      ? bestOffer(category, selected.map((o) => sanitiseOffer(o.commissionOffer, rates)))
      : null;

  const estimate = estimateCommission(
    {
      category,
      destination,
      mediaKind,
      locationConfidence,
      licensedBy: destination === 'directed' ? Math.max(1, selectedOrganisationIds.length) : 1,
      offerPesewas,
    },
    rates,
  );

  return (
    <>
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
                ? offerPesewas
                  ? t('destination.offerHelp')
                  : t('destination.earningHelp')
                : t('destination.noEarningHelp')}
          </Text>
        </View>
      </Glass>
    </>
  );
}
