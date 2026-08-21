import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, Glass, Pressable, SwitchRow, Text } from '@/components/ui';
import { MY_REPORTS } from '@/api/mockData';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'expo-router';
import { accentGradient, categoryColor, colors } from '@/lib/theme';
import { formatCount, formatRelativeTime } from '@/lib/format';
import type { AuthoredIncident, VettingState } from '@/types/api';

const STATE_TONE: Record<VettingState, 'success' | 'warning' | 'danger' | 'info'> = {
  published: 'success',
  pending_review: 'warning',
  rejected: 'danger',
  restricted: 'info',
};

type Tab = 'reports' | 'settings';

function ReportCard({ report }: { report: AuthoredIncident }) {
  const { t } = useTranslation();

  return (
    <Glass elevation="low" className="rounded-lg p-3">
      <View className="flex-row gap-3">
        <View className="overflow-hidden rounded-sm">
          <Image
            source={{ uri: report.media.posterUrl }}
            style={{ width: 56, height: 74 }}
            contentFit="cover"
            transition={160}
          />
        </View>
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: categoryColor[report.category],
              }}
            />
            <Text variant="caption" tone="muted" className="uppercase">
              {t(`category.${report.category}`)}
            </Text>
            {report.isAnonymous ? (
              <View className="flex-row items-center gap-1">
                <Ionicons name="eye-off-outline" size={11} color={colors.textFaint} />
                <Text variant="caption" tone="faint">
                  {t('common.anonymous')}
                </Text>
              </View>
            ) : null}
          </View>

          <Text variant="body-sm" numberOfLines={2}>
            {report.description}
          </Text>

          <View className="flex-row items-center gap-2">
            <Badge
              label={t(`vetting.${report.vettingState}`)}
              tone={STATE_TONE[report.vettingState]}
            />
            <Text variant="caption" tone="faint">
              {formatRelativeTime(report.publishedAt)}
            </Text>
          </View>

          {/* The rejection reason is written for the reporter, so it is shown
              verbatim rather than summarised into a generic failure message. */}
          {report.rejectionReason ? (
            <Glass elevation="low" className="mt-1 rounded-sm p-2.5">
              <Text variant="caption" tone="danger">
                {report.rejectionReason}
              </Text>
            </Glass>
          ) : null}

          {report.vettingState === 'pending_review' ? (
            <Text variant="caption" tone="muted">
              {t('profile.pendingExplainer')}
            </Text>
          ) : null}
        </View>
      </View>
    </Glass>
  );
}

/**
 * Profile — the reporter's own history and settings.
 *
 * PHASE 6 PREVIEW on demo data. Shows reports in every vetting state, because
 * the author sees all of theirs while the public feed shows only `published`.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const [tab, setTab] = useState<Tab>('reports');
  const [stateFilter, setStateFilter] = useState<VettingState | null>(null);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [anonymousDefault, setAnonymousDefault] = useState(false);

  const reports = useMemo(
    () => (stateFilter ? MY_REPORTS.filter((r) => r.vettingState === stateFilter) : MY_REPORTS),
    [stateFilter],
  );

  const states: VettingState[] = ['published', 'pending_review', 'rejected', 'restricted'];

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 96 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Identity header */}
      <View className="items-center gap-3 px-5 pb-5">
        <LinearGradient
          colors={[...accentGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="display-md" className="font-display">
            {(profile?.displayName ?? '?').charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
        <View className="items-center gap-0.5">
          <Text variant="title-lg">{profile?.displayName ?? t('profile.guest')}</Text>
          <Text variant="body-sm" tone="muted">
            {profile?.email ?? t('profile.guestSubtitle')}
          </Text>
        </View>
        {profile?.orgName ? (
          <Badge label={`${profile.orgName} · ${profile.role ?? 'member'}`} tone="accent" />
        ) : null}
        {profile?.accountType === 'platform_owner' ? (
          <Button
            label={t('platform.console')}
            size="sm"
            onPress={() => router.push('/platform/(tabs)')}
            leading={<Ionicons name="git-branch-outline" size={15} color={colors.textOnDark} />}
          />
        ) : null}
        {profile?.accountType === 'reporter' || !profile ? (
          <Button
            label={t('surveys.title')}
            size="sm"
            variant="glass"
            onPress={() => router.push('/surveys')}
            leading={<Ionicons name="clipboard-outline" size={15} color={colors.textPrimary} />}
          />
        ) : null}
        {profile?.accountType === 'reporter' || !profile ? (
          <Button
            label={t('earnings.title')}
            size="sm"
            variant="glass"
            onPress={() => router.push('/earnings')}
            leading={<Ionicons name="cash-outline" size={15} color={colors.textPrimary} />}
          />
        ) : null}
        {profile?.accountType === 'business' ? (
          <Button
            label={t('business.brand')}
            size="sm"
            onPress={() => router.push('/business/(tabs)')}
            leading={<Ionicons name="briefcase-outline" size={15} color={colors.textOnDark} />}
          />
        ) : null}
        {!profile ? (
          <Button
            label={t('business.createAccount')}
            size="sm"
            variant="glass"
            onPress={() => router.push('/business/register')}
          />
        ) : null}
        {!profile ? (
          <Button
            label={t('profile.signIn')}
            size="sm"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        ) : null}
      </View>

      {/* Stats */}
      <View className="flex-row gap-3 px-4 pb-5">
        <Stat label={t('profile.filed')} value={String(MY_REPORTS.length)} />
        <Stat
          label={t('profile.published')}
          value={String(MY_REPORTS.filter((r) => r.vettingState === 'published').length)}
        />
        <Stat
          label={t('profile.reactions')}
          value={formatCount(MY_REPORTS.reduce((sum, r) => sum + r.counts.reactions, 0))}
        />
      </View>

      {/* Tab switch */}
      <View className="px-4 pb-4">
        <Glass elevation="low" className="flex-row rounded-pill p-1">
          {(['reports', 'settings'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityState={{ selected: tab === value }}
              accessibilityLabel={t(`profile.${value}`)}
              className={
                tab === value
                  ? 'flex-1 items-center rounded-pill bg-glass/[0.18] py-2'
                  : 'flex-1 items-center rounded-pill py-2'
              }
            >
              <Text
                variant="body-sm"
                tone={tab === value ? 'primary' : 'muted'}
                className="font-sans-semibold"
              >
                {t(`profile.${value}`)}
              </Text>
            </Pressable>
          ))}
        </Glass>
      </View>

      {tab === 'reports' ? (
        <View className="gap-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-4"
          >
            <Chip
              label={t('profile.all')}
              selected={stateFilter === null}
              onPress={() => setStateFilter(null)}
            />
            {states.map((s) => (
              <Chip
                key={s}
                label={t(`vetting.${s}`)}
                selected={stateFilter === s}
                onPress={() => setStateFilter(stateFilter === s ? null : s)}
              />
            ))}
          </ScrollView>

          <View className="gap-3 px-4">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </View>
        </View>
      ) : (
        <View className="gap-3 px-4">
          <Glass elevation="low" className="rounded-lg px-4">
            <SwitchRow
              label={t('settings.wifiOnly')}
              description={t('settings.wifiOnlyHelp')}
              value={wifiOnly}
              onValueChange={setWifiOnly}
            />
            <SwitchRow
              label={t('settings.notifications')}
              description={t('settings.notificationsHelp')}
              value={notifications}
              onValueChange={setNotifications}
            />
            <SwitchRow
              label={t('settings.anonymousDefault')}
              description={t('settings.anonymousDefaultHelp')}
              value={anonymousDefault}
              onValueChange={setAnonymousDefault}
            />
          </Glass>

          <Glass elevation="low" className="gap-0 rounded-lg">
            <SettingRow icon="language-outline" label={t('settings.language')} value="English" />
            <SettingRow icon="server-outline" label={t('settings.storage')} value="248 MB" />
            <SettingRow icon="document-text-outline" label={t('settings.legal')} />
            {profile ? (
              <SettingRow
                icon="log-out-outline"
                label={t('settings.signOut')}
                danger
                onPress={() => {
                  void signOut();
                  router.replace('/(auth)/sign-in');
                }}
              />
            ) : null}
          </Glass>
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Glass elevation="low" className="flex-1 items-center gap-1 rounded-lg py-3.5">
      <Text variant="title-lg" className="font-display">
        {value}
      </Text>
      <Text variant="caption" tone="muted" className="uppercase">
        {label}
      </Text>
    </Glass>
  );
}

function SettingRow({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="flex-row items-center gap-3 border-b border-hairline/[0.08] px-4 py-3.5"
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textMuted} />
      <Text variant="body" tone={danger ? 'danger' : 'primary'} className="flex-1">
        {label}
      </Text>
      {value ? (
        <Text variant="body-sm" tone="muted">
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
    </Pressable>
  );
}
