import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Glass, Pressable, Text } from '@/components/ui';
import { OrganisationAvatar } from '@/components/OrganisationAvatar';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { useColors } from '@/lib/theme';
import { EarningsEstimate } from './EarningsEstimate';
import type { SubmissionDestination } from '@/types/dawuro';
import type { IncidentCategory, MediaKind } from '@/types/api';

interface DestinationPickerProps {
  destination: SubmissionDestination;
  onChange: (destination: SubmissionDestination) => void;
  selectedOrganisationIds: string[];
  category: IncidentCategory;
  mediaKind: MediaKind;
  locationConfidence: 'high' | 'low';
}

/**
 * Two choices, because every report now goes to GNA either way.
 *
 * There were four: public feed, offer to organisations, send to named
 * organisations only, or both. That set assumed a report might *not* reach GNA,
 * which is no longer true — the feed is where everything lands. So the only
 * question left is whether the reporter also wants particular institutions to
 * receive it directly, and four options asking one question is three too many.
 *
 * `both` is the base: on the feed, and licensable by any subscribing
 * organisation. `directed` is the same plus named recipients — it does not
 * replace GNA, it adds to it, which is why the copy for it no longer says
 * "only the ones you choose".
 */
const OPTIONS: {
  value: SubmissionDestination;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'both', icon: 'layers-outline' },
  { value: 'directed', icon: 'send-outline' },
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
  category,
  mediaKind,
  locationConfidence,
}: DestinationPickerProps) {
  const c = useColors();
  const { t } = useTranslation();

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
   * Both choices below reach GNA, so neither is ever dead — but licensing needs
   * an organisation to exist, and sending to named ones needs the directory to
   * have somebody in it. Where nothing can be licensed, the screen must not
   * quote a commission for it.
   *
   * Promising money is the part that matters. Somebody films something at real
   * risk because a screen said it could earn them seven cedis; if nothing can
   * license it, that was never true and they find out weeks later, if ever.
   */
  const nobodyIsBuying = !directoryPending && !directoryFailed && available.length === 0;

  const selected = available.filter((b) => selectedOrganisationIds.includes(b.id));

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {t('destination.label')}
      </Text>

      <View className="gap-2">
        {OPTIONS.map((option) => {
          const active = destination === option.value;
          /*
           * Only naming recipients needs the directory.
           *
           * Sending to GNA works with no organisation on the platform at all, so
           * the base choice is never marked. Choosing the directed one with an
           * empty directory is shown rather than hidden — a reporter should
           * understand that footage can be sent to institutions — but marked,
           * because a choice that silently does nothing is worse than one that
           * explains itself.
           */
          const inert = nobodyIsBuying && option.value === 'directed';
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

                  {/*
                    Who receives it, on the choice that needs them.

                    This was a card of its own below the four options, reading
                    "Chosen on the next step — 0 selected". Sitting apart like
                    that it looked like a control that had failed to load: a row
                    with a count of zero and nothing to press. It is not a
                    control at all, it is a consequence of the option above it,
                    so it belongs inside that option and only while it is
                    chosen — the standard way a selected row expands to show
                    what it implies.
                  */}
                  {option.value === 'directed' && active ? (
                    <View className="mt-1.5 flex-row items-center gap-2">
                      {selected.length > 0 ? (
                        <>
                          {/* Their faces, overlapping, the way a group chat shows members. */}
                          <View className="flex-row">
                            {selected.slice(0, 3).map((organisation, i) => (
                              <View key={organisation.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                                <OrganisationAvatar
                                  name={organisation.name}
                                  logoUrl={organisation.logoUrl}
                                  size={20}
                                />
                              </View>
                            ))}
                          </View>
                          <Text
                            variant="caption"
                            tone="accent"
                            numberOfLines={1}
                            className="flex-1 font-sans-semibold"
                          >
                            {t('destination.recipientCount', { count: selected.length })}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="arrow-forward-circle" size={14} color={c.accent} />
                          <Text
                            variant="caption"
                            tone="accent"
                            className="flex-1 font-sans-semibold"
                          >
                            {t('destination.chooseNext')}
                          </Text>
                        </>
                      )}
                    </View>
                  ) : null}
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

      {/*
        The figure — but only where it can be true yet.

        A directed report's commission depends on which organisations receive it:
        how many, and whether any of them offers more than the platform rate for
        this category. Neither is known on this step, because naming them is the
        next one. So for that one destination the estimate travels to step four
        and sits beneath the list, where it moves as each newsroom is ticked.

        Every other destination has no recipients to wait for — one licensee is
        the truth — so the figure is final here and stays.
      */}
      {destination !== 'directed' ? (
        <EarningsEstimate
          category={category}
          destination={destination}
          mediaKind={mediaKind}
          locationConfidence={locationConfidence}
          selectedOrganisationIds={selectedOrganisationIds}
        />
      ) : null}
    </View>
  );
}
