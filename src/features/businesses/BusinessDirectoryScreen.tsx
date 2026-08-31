import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Glass, Pressable, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { BUSINESSES, SURVEYS } from '@/api/dawuroData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { useColors } from '@/lib/theme';
import type { BusinessAccount } from '@/types/dawuro';
import type { Incident } from '@/types/api';

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
export function BusinessDirectoryScreen() {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const listed = useMemo(() => {
    // Cancelled accounts are not shown at all: an organisation that has left
    // should not look reachable, and a page that opens onto nothing is worse
    // than an absence.
    const live = BUSINESSES.filter((b) => b.subscriptionStatus !== 'cancelled');
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter(
      (b) => b.name.toLowerCase().includes(q) || b.sector.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="gap-3 px-4 pb-3 pt-1">
        <View>
          <Text variant="title-lg">{t('businesses.title')}</Text>
          <Text variant="body-sm" tone="muted" className="mt-0.5">
            {t('businesses.subtitle')}
          </Text>
        </View>

        <Glass elevation="low" className="flex-row items-center gap-2.5 rounded-lg px-3">
          <Ionicons name="search" size={16} color={c.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('businesses.searchPlaceholder')}
            placeholderTextColor={c.textFaint}
            accessibilityLabel={t('businesses.search')}
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
        data={listed}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE,
        }}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
        renderItem={({ item }) => (
          <BusinessCard business={item} onPress={() => router.push(`/businesses/${item.id}`)} />
        )}
        ListEmptyComponent={
          <View className="pt-8">
            <EmptyState
              icon="business-outline"
              title={t('businesses.noMatchTitle')}
              description={t('businesses.noMatchBody')}
            />
          </View>
        }
      />
    </View>
  );
}

function BusinessCard({ business, onPress }: { business: BusinessAccount; onPress: () => void }) {
  const { t } = useTranslation();
  const c = useColors();

  // Counted here rather than stored, because the numbers are what make a card
  // worth tapping — "12 reports, 2 surveys" says more than a sector label.
  const published = SAMPLE_INCIDENTS.filter(
    (i: Incident) => i.publisher.kind === 'organisation' && i.publisher.id === business.id,
  ).length;
  const openSurveys = SURVEYS.filter(
    (s) => s.businessId === business.id && s.status === 'live',
  ).length;

  return (
    <Pressable onPress={onPress} accessibilityLabel={business.name}>
      <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
        <View className="h-11 w-11 items-center justify-center rounded-sm bg-accent-wash">
          <Ionicons name="business" size={19} color={c.accent} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text variant="body" className="font-sans-semibold" numberOfLines={1}>
              {business.name}
            </Text>
            {business.verified ? (
              <Ionicons name="checkmark-circle" size={13} color={c.success} />
            ) : null}
          </View>
          <Text variant="caption" tone="muted" className="mt-0.5">
            {t(`sector.${business.sector}`)}
            {published > 0 ? ` · ${t('businesses.reportCount', { count: published })}` : ''}
            {openSurveys > 0 ? ` · ${t('businesses.surveyCount', { count: openSurveys })}` : ''}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Glass>
    </Pressable>
  );
}
