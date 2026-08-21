import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Glass, Pressable, Text } from '@/components/ui';
import { ORG_STATS, ORG_TREND, SAVED_QUERIES } from '@/api/mockData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { categoryColor, colors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { Sparkline } from '@/components/Sparkline';
import { RequireRole } from './RequireRole';
import { useRole } from './useRole';

/**
 * The institution dashboard.
 *
 * Scanned, not read — so the layout leads with the numbers that would make
 * someone act, and pushes detail behind them. Counts by category, the fortnight
 * trend, and the reports needing attention right now.
 */
export function OrgDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const { role } = useRole();

  const total = useMemo(() => ORG_STATS.reduce((sum, s) => sum + s.count, 0), []);
  const weekOverWeek = useMemo(() => {
    const half = Math.floor(ORG_TREND.length / 2);
    const previous = ORG_TREND.slice(0, half).reduce((a, b) => a + b, 0);
    const recent = ORG_TREND.slice(half).reduce((a, b) => a + b, 0);
    if (previous === 0) return 0;
    return Math.round(((recent - previous) / previous) * 100);
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
      contentContainerClassName="gap-5 px-4"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-1">
        <Text variant="label" tone="muted">
          {t('org.dashboard')}
        </Text>
        <Text variant="display-md">{profile?.orgName ?? t('org.yourOrganisation')}</Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Badge label={role ?? 'member'} tone="accent" />
          <Text variant="caption" tone="muted">
            {t('org.last14Days')}
          </Text>
        </View>
      </View>

      {/* Headline volume + trend */}
      <Glass elevation="low" className="gap-4 rounded-lg p-4">
        <View className="flex-row items-end justify-between">
          <View className="gap-0.5">
            <Text variant="display-lg" className="font-display">
              {total}
            </Text>
            <Text variant="caption" tone="muted" className="uppercase">
              {t('org.reportsMatched')}
            </Text>
          </View>
          <View className="items-end gap-0.5">
            <View className="flex-row items-center gap-1">
              <Ionicons
                name={weekOverWeek >= 0 ? 'trending-up' : 'trending-down'}
                size={15}
                color={weekOverWeek >= 0 ? colors.warning : colors.success}
              />
              <Text
                variant="body-sm"
                tone={weekOverWeek >= 0 ? 'warning' : 'success'}
                className="font-sans-semibold"
              >
                {weekOverWeek >= 0 ? '+' : ''}
                {weekOverWeek}%
              </Text>
            </View>
            <Text variant="caption" tone="faint">
              {t('org.vsPreviousWeek')}
            </Text>
          </View>
        </View>
        <Sparkline values={ORG_TREND} />
      </Glass>

      {/* By category */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('org.byCategory')}
        </Text>
        <Glass elevation="low" className="gap-3 rounded-lg p-4">
          {ORG_STATS.map((stat) => {
            const share = stat.count / (ORG_STATS[0]?.count ?? 1);
            return (
              <View key={stat.category} className="gap-1.5">
                <View className="flex-row items-center gap-2">
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: categoryColor[stat.category],
                    }}
                  />
                  <Text variant="body-sm" className="flex-1">
                    {t(`category.${stat.category}`)}
                  </Text>
                  <Text variant="body-sm" className="font-sans-semibold">
                    {stat.count}
                  </Text>
                  <Text
                    variant="caption"
                    tone={stat.deltaPct >= 0 ? 'warning' : 'success'}
                    className="w-10 text-right"
                  >
                    {stat.deltaPct >= 0 ? '+' : ''}
                    {stat.deltaPct}%
                  </Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-pill bg-canvas-raise">
                  <View
                    className="h-full rounded-pill"
                    style={{
                      width: `${share * 100}%`,
                      backgroundColor: categoryColor[stat.category],
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Glass>
      </View>

      {/* Saved queries */}
      <RequireRole capability="manage_queries" silent>
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text variant="label" tone="muted">
              {t('org.watchQueries')}
            </Text>
            <Pressable
              onPress={() => router.push('/org/queries')}
              haptic={false}
              accessibilityLabel={t('common.viewAll')}
            >
              <Text variant="caption" tone="accent" className="font-sans-semibold">
                {t('common.viewAll')}
              </Text>
            </Pressable>
          </View>
          <View className="gap-2">
            {SAVED_QUERIES.slice(0, 2).map((query) => (
              <Pressable
                key={query.id}
                onPress={() => router.push(`/org/queries/${query.id}`)}
                accessibilityLabel={query.name}
              >
                <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
                  <View className="h-9 w-9 items-center justify-center rounded-pill bg-accent-wash">
                    <Ionicons name="funnel-outline" size={16} color={colors.accent} />
                  </View>
                  <View className="flex-1">
                    <Text variant="body-sm" className="font-sans-semibold" numberOfLines={1}>
                      {query.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('org.matches', { count: query.matchCount })} ·{' '}
                      {(query.radiusM / 1000).toFixed(1)} km
                    </Text>
                  </View>
                  {query.alertsOn ? (
                    <Ionicons name="notifications" size={15} color={colors.accent} />
                  ) : null}
                </Glass>
              </Pressable>
            ))}
          </View>
        </View>
      </RequireRole>

      {/* Needs attention */}
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="muted">
            {t('org.needsAttention')}
          </Text>
          <Pressable
            onPress={() => router.push('/org/inbox')}
            haptic={false}
            accessibilityLabel={t('org.openInbox')}
          >
            <Text variant="caption" tone="accent" className="font-sans-semibold">
              {t('org.openInbox')}
            </Text>
          </Pressable>
        </View>
        <View className="gap-2">
          {SAMPLE_INCIDENTS.slice(0, 3).map((incident) => (
            <Pressable
              key={incident.id}
              onPress={() => router.push(`/incident/${incident.id}`)}
              accessibilityLabel={incident.description}
            >
              <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
                <View
                  style={{ backgroundColor: categoryColor[incident.category] }}
                  className="h-9 w-1 rounded-pill"
                />
                <View className="flex-1 gap-0.5">
                  <Text variant="body-sm" numberOfLines={1}>
                    {incident.description}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t(`category.${incident.category}`)}
                    {incident.capturedAtIso
                      ? ` · ${formatRelativeTime(incident.capturedAtIso)}`
                      : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
              </Glass>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
