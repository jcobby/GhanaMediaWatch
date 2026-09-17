import { useMemo } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { OrganisationAvatar } from '@/components/OrganisationAvatar';
import { useColors } from '@/lib/theme';
import { hapticSelect } from '@/lib/haptics';
import type { DirectoryOrganisation } from '@/types/dawuro';
import { filterOrganisations } from './organisationSearch';

/**
 * A searchable list of organisations, used wherever one is chosen.
 *
 * Two places use it and they behave identically: the home search, where one is
 * opened, and the last step of filing, where several are ticked. Two separate
 * pickers is how the app ended up with a search box inside a sheet under another
 * search box in the bar.
 *
 * It renders a plain column, not its own scroller, so the screen around it can
 * own the scrolling — nested scrollers are what make a list feel stuck.
 */
export function OrganisationList({
  organisations,
  query,
  onQuery,
  mode,
  selectedIds = [],
  onChoose,
  loading = false,
  failed = false,
  emptyTitle,
  emptyBody,
  autoFocus = false,
}: {
  organisations: DirectoryOrganisation[];
  query: string;
  onQuery: (value: string) => void;
  mode: 'single' | 'multi';
  selectedIds?: string[];
  onChoose: (id: string) => void;
  loading?: boolean;
  failed?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  autoFocus?: boolean;
}) {
  const c = useColors();
  const { t } = useTranslation();

  const results = useMemo(
    () => filterOrganisations(organisations, query, (o) => t(`sector.${o.sector}`)),
    [organisations, query, t],
  );

  return (
    <View className="gap-3">
      <View className="h-11 flex-row items-center gap-2 rounded-pill bg-canvas-raise px-3.5">
        <Ionicons name="search" size={17} color={c.textMuted} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder={t('destination.forwardSearch')}
          placeholderTextColor={c.textFaint}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel={t('destination.forwardSearch')}
          style={{ flex: 1, color: c.textPrimary, fontFamily: 'Inter_400Regular', fontSize: 15, padding: 0 }}
        />
        {query ? (
          <Pressable onPress={() => onQuery('')} accessibilityLabel={t('common.clear')} haptic={false}>
            <Ionicons name="close-circle" size={18} color={c.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <Text variant="body-sm" tone="muted" className="py-8 text-center">
          {t('destination.loadingOrganisations')}
        </Text>
      ) : failed ? (
        <View className="gap-1 py-8">
          <Text variant="body-sm" className="text-center">
            {t('destination.directoryFailedTitle')}
          </Text>
          <Text variant="caption" tone="muted" className="text-center">
            {t('destination.directoryFailedBody')}
          </Text>
        </View>
      ) : organisations.length === 0 ? (
        <View className="gap-1 py-8">
          <Text variant="body-sm" className="text-center">
            {emptyTitle ?? t('destination.noOrganisationsTitle')}
          </Text>
          {emptyBody ? (
            <Text variant="caption" tone="muted" className="text-center">
              {emptyBody}
            </Text>
          ) : null}
        </View>
      ) : results.length === 0 ? (
        <Text variant="body-sm" tone="muted" className="py-8 text-center">
          {t('destination.forwardNoMatch', { query: query.trim() })}
        </Text>
      ) : (
        <View>
          {results.map((organisation) => {
            const on = selectedIds.includes(organisation.id);
            return (
              <Pressable
                key={organisation.id}
                onPress={() => {
                  hapticSelect();
                  onChoose(organisation.id);
                }}
                haptic={false}
                accessibilityRole={mode === 'multi' ? 'checkbox' : 'button'}
                accessibilityState={mode === 'multi' ? { checked: on } : { selected: on }}
                accessibilityLabel={organisation.name}
                className="flex-row items-center gap-3 py-2.5"
              >
                <OrganisationAvatar name={organisation.name} logoUrl={organisation.logoUrl} size={44} />
                <View className="flex-1 border-b border-hairline/[0.06] pb-2.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text variant="body" className="shrink font-sans-semibold" numberOfLines={1}>
                      {organisation.name}
                    </Text>
                    {organisation.verified ? (
                      <Ionicons name="checkmark-circle" size={14} color={c.info} />
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {t(`sector.${organisation.sector}`)}
                  </Text>
                </View>
                {mode === 'multi' ? (
                  <View
                    className={
                      on
                        ? 'h-6 w-6 items-center justify-center rounded-pill bg-accent'
                        : 'h-6 w-6 rounded-pill border-2 border-hairline/25'
                    }
                  >
                    {on ? <Ionicons name="checkmark" size={14} color={c.textOnDark} /> : null}
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
