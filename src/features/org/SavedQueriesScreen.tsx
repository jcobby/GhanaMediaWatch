import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, EmptyState, Glass, Pressable, Text } from '@/components/ui';
import { SAVED_QUERIES } from '@/api/mockData';
import { categoryColor, colors } from '@/lib/theme';
import { formatDistance } from '@/lib/format';
import { RequireRole } from './RequireRole';

/**
 * An organisation's standing watch criteria.
 *
 * Each query is a persistent interest — "flooding near the Odaw", "disorder at
 * polling stations" — rather than a one-off search, which is what makes the
 * crowd-sourced feed useful to an institution that cannot watch it all day.
 */
export function SavedQueriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-canvas">
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
          className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text variant="title-lg" className="flex-1">
          {t('org.watchQueries')}
        </Text>
      </View>

      {SAVED_QUERIES.length === 0 ? (
        <EmptyState
          icon="funnel-outline"
          title={t('org.noQueriesTitle')}
          description={t('org.noQueriesBody')}
          actionLabel={t('org.newQuery')}
          onAction={() => router.push('/org/queries/new')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          showsVerticalScrollIndicator={false}
        >
          {SAVED_QUERIES.map((query) => (
            <Pressable
              key={query.id}
              onPress={() => router.push(`/org/queries/${query.id}`)}
              accessibilityLabel={query.name}
            >
              <Glass elevation="low" className="gap-3 rounded-lg p-4">
                <View className="flex-row items-start gap-3">
                  <View className="flex-1 gap-1">
                    <Text variant="title-sm">{query.name}</Text>
                    <Text variant="caption" tone="muted">
                      {query.centerLabel} · {formatDistance(query.radiusM)}
                    </Text>
                  </View>
                  {query.alertsOn ? (
                    <Badge label={t('org.alertsOn')} tone="accent" />
                  ) : (
                    <Badge label={t('org.alertsOff')} tone="neutral" />
                  )}
                </View>

                <View className="flex-row flex-wrap gap-1.5">
                  {query.categories.map((c) => (
                    <View
                      key={c}
                      className="flex-row items-center gap-1.5 rounded-pill bg-canvas-raise px-2.5 py-1"
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: categoryColor[c],
                        }}
                      />
                      <Text variant="caption" tone="secondary">
                        {t(`category.${c}`)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View className="flex-row items-center gap-1.5 border-t border-hairline/[0.07] pt-3">
                  <Ionicons name="documents-outline" size={14} color={colors.accent} />
                  <Text variant="body-sm" tone="accent" className="font-sans-semibold">
                    {t('org.matches', { count: query.matchCount })}
                  </Text>
                  <View className="flex-1" />
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                </View>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <RequireRole capability="manage_queries" silent>
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            label={t('org.newQuery')}
            fullWidth
            size="lg"
            onPress={() => router.push('/org/queries/new')}
          />
        </View>
      </RequireRole>
    </View>
  );
}
