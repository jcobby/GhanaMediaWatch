import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Glass, Pressable, Text } from '@/components/ui';
import { Sparkline } from '@/components/Sparkline';
import {
  BUSINESS_APPLICATIONS,
  PAYOUT_BATCHES,
  PLATFORM_METRICS,
  ROUTING_QUEUE,
} from '@/api/dawuroData';
import { accentGradient, colors } from '@/lib/theme';
import { formatCedis } from '@/types/dawuro';
import { useAuthStore } from '@/stores/authStore';

/**
 * The platform operator's home.
 *
 * An operations console, not a report screen — so it leads with the things that
 * are *stuck*: applications waiting on a decision, submissions nothing matched,
 * and a payout batch nobody has released. Vanity totals sit underneath.
 *
 * The margin figure is deliberately prominent. Revenue minus payouts is the
 * number that decides whether the commission rates work, and burying it would
 * mean discovering a broken model a quarter late.
 */
export function PlatformDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const m = PLATFORM_METRICS;
  const pendingApplications = BUSINESS_APPLICATIONS.filter((a) => a.status === 'pending').length;
  const needsRouting = ROUTING_QUEUE.filter((r) => r.status === 'awaiting_routing').length;
  const draftBatch = PAYOUT_BATCHES.find((b) => b.status === 'draft');

  const marginPesewas = m.revenueThisMonthPesewas - m.payoutsThisMonthPesewas;
  const marginPct = Math.round((marginPesewas / m.revenueThisMonthPesewas) * 100);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
      contentContainerClassName="gap-5 px-4"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
            {t('platform.console')}
          </Text>
          <Text variant="display-md">{t('platform.operations')}</Text>
          <Text variant="body-sm" tone="muted">
            {profile?.displayName ?? t('platform.operator')}
          </Text>
        </View>
        {/* The operator shell is four queues with no account screen, so this
            lives here rather than behind a fifth tab for a single action. */}
        <Pressable
          onPress={() => {
            void signOut();
            router.replace('/(auth)/sign-in');
          }}
          accessibilityLabel={t('settings.signOut')}
          className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>

      {/* Things that are stuck. These lead because nothing else matters if a
          business application has been waiting two days. */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('platform.needsYou')}
        </Text>
        <View className="gap-2">
          <ActionRow
            icon="business-outline"
            label={t('platform.pendingApplications')}
            count={pendingApplications}
            tone={pendingApplications > 0 ? 'warning' : 'neutral'}
            onPress={() => router.push('/platform/applications')}
          />
          <ActionRow
            icon="git-branch-outline"
            label={t('platform.needsRouting')}
            count={needsRouting}
            tone={needsRouting > 0 ? 'accent' : 'neutral'}
            onPress={() => router.push('/platform/routing')}
          />
          <ActionRow
            icon="cash-outline"
            label={t('platform.payoutReady')}
            count={draftBatch?.reporterCount ?? 0}
            subtitle={
              draftBatch ? formatCedis(draftBatch.totalPesewas, { compact: true }) : undefined
            }
            tone={draftBatch ? 'success' : 'neutral'}
            onPress={() => router.push('/platform/payouts')}
          />
        </View>
      </View>

      {/* Money. Revenue against payouts, because the gap is the business. */}
      <LinearGradient
        colors={[...accentGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 20, padding: 20, gap: 16 }}
      >
        <View className="flex-row items-start justify-between">
          <View className="gap-0.5">
            <Text variant="caption" className="uppercase text-white/70">
              {t('platform.marginThisMonth')}
            </Text>
            <Text variant="display-md" className="font-display text-white">
              {formatCedis(marginPesewas, { compact: true })}
            </Text>
          </View>
          <View className="items-end gap-0.5">
            <Text variant="title-md" className="font-display text-white">
              {marginPct}%
            </Text>
            <Text variant="caption" className="text-white/70">
              {t('platform.ofRevenue')}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1 gap-0.5">
            <Text variant="caption" className="text-white/70">
              {t('platform.revenue')}
            </Text>
            <Text variant="body" className="font-sans-semibold text-white">
              {formatCedis(m.revenueThisMonthPesewas, { compact: true })}
            </Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="caption" className="text-white/70">
              {t('platform.paidToReporters')}
            </Text>
            <Text variant="body" className="font-sans-semibold text-white">
              {formatCedis(m.payoutsThisMonthPesewas, { compact: true })}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Volume */}
      <Glass elevation="low" className="gap-4 rounded-lg p-4">
        <View className="flex-row items-end justify-between">
          <View className="gap-0.5">
            <Text variant="display-md" className="font-display">
              {m.reportsToday}
            </Text>
            <Text variant="caption" tone="muted" className="uppercase">
              {t('platform.reportsToday')}
            </Text>
          </View>
          <View className="items-end gap-0.5">
            <Text variant="body" className="font-sans-semibold">
              {Math.round((m.reportsRoutedToday / m.reportsToday) * 100)}%
            </Text>
            <Text variant="caption" tone="muted">
              {t('platform.autoRouted')}
            </Text>
          </View>
        </View>
        <Sparkline values={[...m.submissionTrend]} />
      </Glass>

      {/* Scale */}
      <View className="flex-row gap-3">
        <Stat label={t('platform.businesses')} value={String(m.activeBusinesses)} />
        <Stat label={t('platform.reporters')} value={m.activeReporters.toLocaleString('en-GH')} />
        <Stat label={t('platform.unmatched')} value={String(m.awaitingReview)} />
      </View>

      <Pressable
        onPress={() => router.push('/platform/businesses')}
        accessibilityLabel={t('platform.manageBusinesses')}
      >
        <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-4">
          <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent-wash">
            <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
          </View>
          <Text variant="body" className="flex-1 font-sans-semibold">
            {t('platform.manageBusinesses')}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Glass>
      </Pressable>
    </ScrollView>
  );
}

function ActionRow({
  icon,
  label,
  count,
  subtitle,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  subtitle?: string;
  tone: 'neutral' | 'accent' | 'warning' | 'success';
  onPress: () => void;
}) {
  const tint =
    tone === 'warning'
      ? colors.warning
      : tone === 'success'
        ? colors.success
        : tone === 'accent'
          ? colors.accent
          : colors.textMuted;

  return (
    <Pressable onPress={onPress} accessibilityLabel={`${label}, ${count}`}>
      <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
        <View
          className="h-10 w-10 items-center justify-center rounded-pill"
          style={{ backgroundColor: `${tint}1F` }}
        >
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        <View className="flex-1">
          <Text variant="body-sm" className="font-sans-semibold">
            {label}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {count > 0 ? (
          <Badge
            label={String(count)}
            tone={tone === 'neutral' ? 'neutral' : (tone as 'accent' | 'warning' | 'success')}
          />
        ) : (
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        )}
        <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
      </Glass>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Glass elevation="low" className="flex-1 items-center gap-1 rounded-lg py-3.5">
      <Text variant="title-md" className="font-display">
        {value}
      </Text>
      <Text variant="caption" tone="muted" className="text-center uppercase">
        {label}
      </Text>
    </Glass>
  );
}
