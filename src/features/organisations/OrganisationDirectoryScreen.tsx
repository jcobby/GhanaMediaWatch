import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Glass, Pressable, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { useSurveys } from '@/hooks/useSurveys';
import { useFeed } from '@/hooks/useIncidents';
import { useColors } from '@/lib/theme';
import type { DirectoryOrganisation } from '@/types/dawuro';

/**
 * Every organisation on the platform, searchable.
 *
 * The feed answers "what is happening near me". This answers the other
 * question people arrive with — "what is my assembly doing", "what has the
 * newsroom published" — which the feed cannot, because it is ordered by time
 * rather than by who.
 *
 * Sectors are shown rather than filtered on. Six organisations do not need a
 * filter, and adding one now would be building for a directory that does not
 * exist yet.
 */
export function OrganisationDirectoryScreen() {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  /*
   * The real directory, and what each organisation has actually published.
   *
   * All three lists were seeded, so this screen introduced organisations that
   * are not on the platform and credited them with reports nobody filed. It is
   * the page a reporter uses to decide who to send footage to.
   */
  const { data: directory, isPending: dirPending, isError: dirFailed } = useOrganisations();
  const { data: surveyList } = useSurveys();
  const { data: feed } = useFeed({ limit: 100 });
  const surveys = useMemo(() => surveyList ?? [], [surveyList]);
  const published = useMemo(() => feed?.items ?? [], [feed]);

  const listed = useMemo(() => {
    /*
      Only organisations the platform has verified.

      This filtered on `subscriptionStatus !== 'cancelled'`, and the public
      directory does not send a subscription status — so the test passed on
      `undefined !== 'cancelled'` and let everything through, including
      anything the platform had not approved. `receiving()` is the shared
      answer to the same question and is what the capture screen uses, so the
      directory and the picker cannot disagree about who is reachable.
    */
    const live = receiving(directory);
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter(
      (b) => b.name.toLowerCase().includes(q) || b.sector.toLowerCase().includes(q),
    );
  }, [directory, query]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="gap-3 px-4 pb-3 pt-1">
        <View>
          <Text variant="title-lg">{t('organisations.title')}</Text>
          <Text variant="body-sm" tone="muted" className="mt-0.5">
            {t('organisations.subtitle')}
          </Text>
        </View>

        <Glass elevation="low" className="flex-row items-center gap-2.5 rounded-lg px-3">
          <Ionicons name="search" size={16} color={c.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('organisations.searchPlaceholder')}
            placeholderTextColor={c.textFaint}
            accessibilityLabel={t('organisations.search')}
            style={{
              flex: 1,
              paddingVertical: 11,
              color: c.textPrimary,
              fontFamily: 'Inter_400Regular',
              fontSize: 15,
            }}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              haptic={false}
              accessibilityLabel={t('common.clear')}
            >
              <Ionicons name="close-circle" size={16} color={c.textFaint} />
            </Pressable>
          ) : null}
        </Glass>
      </View>

      <FlashList
        /*
          Without this the first tap while the keyboard is up only dismisses
          it, and the button under your finger does nothing — so every action
          on a form takes two taps and the first one looks broken.
        */
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={listed}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE,
        }}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
        renderItem={({ item }) => (
          <OrganisationCard
            organisation={item}
            published={
              published.filter(
                (i) => i.publisher.kind === 'organisation' && i.publisher.id === item.id,
              ).length
            }
            openSurveys={
              surveys.filter((sv) => sv.businessId === item.id && sv.status === 'live').length
            }
            onPress={() => router.push(`/organisations/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View className="pt-8">
            {/*
              An empty directory is not the same as an empty search.

              "No organisations match 'nadmo'" tells somebody to try another
              word. "No organisations have joined yet" tells them the platform
              is new — and that sending a report to a named agency is not yet
              an option. They must not be shown the same sentence.
            */}
            <EmptyState
              icon={dirFailed ? 'cloud-offline-outline' : 'business-outline'}
              title={
                dirPending
                  ? t('organisations.loadingTitle')
                  : dirFailed
                    ? t('organisations.unavailableTitle')
                    : query.trim()
                      ? t('organisations.noMatchTitle')
                      : t('organisations.noneYetTitle')
              }
              description={
                dirPending
                  ? t('organisations.loadingBody')
                  : dirFailed
                    ? t('organisations.unavailableBody')
                    : query.trim()
                      ? t('organisations.noMatchBody')
                      : t('organisations.noneYetBody')
              }
            />
          </View>
        }
      />
    </View>
  );
}

function OrganisationCard({
  organisation,
  published,
  openSurveys,
  onPress,
}: {
  organisation: DirectoryOrganisation;
  /*
   * Counted by the screen, which is where the live data is.
   *
   * The card used to count over seeded incidents and surveys, so every
   * organisation in the directory advertised published reports and running
   * surveys that do not exist — the two numbers that make a card worth tapping.
   */
  published: number;
  openSurveys: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const c = useColors();

  return (
    <Pressable onPress={onPress} accessibilityLabel={organisation.name}>
      <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
        <View className="h-11 w-11 items-center justify-center rounded-sm bg-accent-wash">
          <Ionicons name="business" size={19} color={c.accent} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text variant="body" className="font-sans-semibold" numberOfLines={1}>
              {organisation.name}
            </Text>
            {organisation.verified ? (
              <Ionicons name="checkmark-circle" size={13} color={c.success} />
            ) : null}
          </View>
          <Text variant="caption" tone="muted" className="mt-0.5">
            {t(`sector.${organisation.sector}`)}
            {published > 0 ? ` · ${t('organisations.reportCount', { count: published })}` : ''}
            {openSurveys > 0 ? ` · ${t('organisations.surveyCount', { count: openSurveys })}` : ''}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Glass>
    </Pressable>
  );
}
