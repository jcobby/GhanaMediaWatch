import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Glass,
  Pressable,
  Sheet,
  SkeletonList,
  SwitchRow,
  Text,
} from '@/components/ui';
import { useMyIncidents } from '@/hooks/useIncidents';
import { ORGANISATION_TIER_ENABLED } from '@/lib/features';
import { toast } from '@/stores/toastStore';
import { ReportGrid } from './ReportGrid';
import { ReportSheetBody } from './ReportSheetBody';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'expo-router';
import { accentGradient, useColors } from '@/lib/theme';
import { formatCount } from '@/lib/format';
import { ApiError, type AuthoredIncident, type VettingState } from '@/types/api';
import { describeApiError } from '@/lib/apiErrorCopy';

type Tab = 'reports' | 'settings';

/**
 * Profile — the reporter's own history and settings.
 *
 * The Reports tab is the answer to "where do I see what I have sent". Bound to
 * `/me/incidents`, so it shows the reporter's own work in every vetting state —
 * the author sees all of theirs, while the public feed shows only `published`.
 *
 * That makes the empty and failed states load-bearing rather than decorative:
 * this is the screen somebody comes to when a report has just left the queue,
 * and rendering nothing is the same as telling them it is gone.
 */
export function ProfileScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const replayOnboarding = useAuthStore((s) => s.replayOnboarding);
  const [tab, setTab] = useState<Tab>('reports');
  const [stateFilter, setStateFilter] = useState<VettingState | null>(null);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [notifications, setNotifications] = useState(true);
  /** The report whose outcome the reporter is reading, if any. */
  const [outcomeReport, setOutcomeFor] = useState<AuthoredIncident | null>(null);
  const [anonymousDefault, setAnonymousDefault] = useState(false);

  /*
   * The reporter's own reports, from the server.
   *
   * These counts were computed from a fixed set of six invented reports, so a
   * brand new account was told it had filed six and collected nineteen thousand
   * reactions. That is not a placeholder — it is the app telling somebody a
   * fact about themselves that is not true.
   */
  const {
    data: minePage,
    isPending: minePending,
    isError: mineFailed,
    error: mineError,
    refetch: refetchMine,
  } = useMyIncidents();
  const mine = useMemo(() => minePage?.items ?? [], [minePage]);

  /*
   * The server's own reason, where it has one.
   *
   * A guest gets `SIGN_IN_REQUIRED` here — the `/me` endpoints are refused to a
   * device token — and that needs to read as "make an account", not as a
   * failure. An outage needs to read as an outage. Both used to render as an
   * empty area under the filter chips, which says nothing at all and is why
   * there was no way to tell "you have not filed anything" apart from "we could
   * not ask".
   */
  const mineErrorCopy = describeApiError(mineError, t, {
    title: t('profile.reportsErrorTitle'),
    body: t('profile.reportsErrorBody'),
  });

  const reports = useMemo(
    () => (stateFilter ? mine.filter((r) => r.vettingState === stateFilter) : mine),
    // `mine` is load-bearing: without it the list is computed once, while the
    // request is still in flight, and never recomputes when the reports land.
    [stateFilter, mine],
  );

  const states: VettingState[] = ['published', 'pending_review', 'rejected', 'restricted'];

  return (
    <>
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
              leading={<Ionicons name="git-branch-outline" size={15} color={c.textOnDark} />}
            />
          ) : null}
          {profile?.accountType === 'reporter' || !profile ? (
            <Button
              label={t('surveys.title')}
              size="sm"
              variant="glass"
              onPress={() => router.push('/surveys')}
              leading={<Ionicons name="clipboard-outline" size={15} color={c.textPrimary} />}
            />
          ) : null}
          {profile?.accountType === 'reporter' || !profile ? (
            <Button
              label={t('earnings.title')}
              size="sm"
              variant="glass"
              onPress={() => router.push('/earnings')}
              leading={<Ionicons name="cash-outline" size={15} color={c.textPrimary} />}
            />
          ) : null}
          {ORGANISATION_TIER_ENABLED && profile?.accountType === 'organisation' ? (
            <Button
              label={t('organisation.brand')}
              size="sm"
              onPress={() => router.push('/organisation/(tabs)')}
              leading={<Ionicons name="briefcase-outline" size={15} color={c.textOnDark} />}
            />
          ) : null}
          {ORGANISATION_TIER_ENABLED && !profile ? (
            <Button
              label={t('organisation.createAccount')}
              size="sm"
              variant="glass"
              onPress={() => router.push('/organisation/register')}
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
          <Stat label={t('profile.filed')} value={String(mine.length)} />
          <Stat
            label={t('profile.published')}
            value={String(mine.filter((r) => r.vettingState === 'published').length)}
          />
          <Stat
            label={t('profile.reactions')}
            value={formatCount(mine.reduce((sum, r) => sum + r.counts.reactions, 0))}
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
              {/*
                Four outcomes, four answers.

                This list used to be `reports.map(...)` and nothing else, so
                every one of these — still loading, could not load, no account,
                nothing filed yet — rendered as the same blank space below the
                chips. Somebody looking for a report they had just sent found an
                empty screen that gave them no way to tell which it was.
              */}
              {minePending ? (
                <SkeletonList count={3} />
              ) : mineFailed ? (
                <ErrorState
                  title={mineErrorCopy.title}
                  description={mineErrorCopy.body}
                  retryLabel={
                    mineError instanceof ApiError && mineError.code === 'SIGN_IN_REQUIRED'
                      ? t('profile.signIn')
                      : t('common.retry')
                  }
                  onRetry={() =>
                    mineError instanceof ApiError && mineError.code === 'SIGN_IN_REQUIRED'
                      ? router.push('/(auth)/sign-in')
                      : void refetchMine()
                  }
                />
              ) : reports.length === 0 ? (
                <EmptyState
                  icon={stateFilter ? 'funnel-outline' : 'videocam-outline'}
                  title={stateFilter ? t('profile.noneInStateTitle') : t('profile.noReportsTitle')}
                  // A filter hiding everything is not the same as having filed
                  // nothing, and only one of them is worth offering the camera for.
                  description={
                    stateFilter ? t('profile.noneInStateBody') : t('profile.noReportsBody')
                  }
                  actionLabel={stateFilter ? t('profile.all') : t('profile.fileFirst')}
                  onAction={() =>
                    stateFilter ? setStateFilter(null) : router.push('/(tabs)/capture')
                  }
                />
              ) : (
                /*
                  A gallery grid, not a stack of cards.

                  Three across and square, the shape people already know for
                  "things I recorded" — twelve reports visible instead of four,
                  and finding one filmed last week stops being a scroll. Each
                  tile carries a single mark saying whether it got anywhere, and
                  opens the full record on tap, so nothing the cards showed is
                  lost, only moved one tap away.
                */
                <ReportGrid reports={reports} onOpen={(r) => setOutcomeFor(r)} />
              )}
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
              {/* The anonymity slide is the one people come back for, and until
                  this existed the only route to it was reinstalling. */}
              <SettingRow
                icon="information-circle-outline"
                label={t('settings.replayIntro')}
                onPress={() => {
                  void replayOnboarding();
                  router.replace('/(auth)/onboarding');
                }}
              />
              {profile ? (
                <SettingRow
                  icon="log-out-outline"
                  label={t('settings.signOut')}
                  danger
                  onPress={() => {
                    void signOut();
                    /*
                     * The body is the point, not the title. Signing out looks
                     * like it might discard whatever has not uploaded yet, and
                     * a reporter who believes that will not sign out on a
                     * shared phone. It does not, and saying so is the only way
                     * they can know.
                     */
                    toast.info(t('auth.signedOutTitle'), t('auth.signedOutBody'));
                    router.replace('/(auth)/sign-in');
                  }}
                />
              ) : null}
            </Glass>
          </View>
        )}
      </ScrollView>

      {/*
        The full story, on demand.

        A sheet rather than a route: the reporter is checking on something in a
        list and expects to come back to the same place in it, which a push
        transition takes away.
      */}
      <Sheet
        visible={outcomeReport !== null}
        onClose={() => setOutcomeFor(null)}
        title={t('profile.reportTitle')}
        subtitle={outcomeReport?.description}
      >
        {outcomeReport ? (
          <ReportSheetBody
            report={outcomeReport}
            /* The report it was showing is gone; leaving the sheet open over
               nothing would be the app disagreeing with itself. */
            onWithdrawn={() => setOutcomeFor(null)}
          />
        ) : null}
      </Sheet>
    </>
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
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="flex-row items-center gap-3 border-b border-hairline/[0.08] px-4 py-3.5"
    >
      <Ionicons name={icon} size={18} color={danger ? c.danger : c.textMuted} />
      <Text variant="body" tone={danger ? 'danger' : 'primary'} className="flex-1">
        {label}
      </Text>
      {value ? (
        <Text variant="body-sm" tone="muted">
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
    </Pressable>
  );
}
