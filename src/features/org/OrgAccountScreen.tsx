import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Glass, Skeleton, Text } from '@/components/ui';
import { SettingRow } from '@/components/SettingRow';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { AccountSettings } from '@/features/profile/AccountSettings';
import {
  useDecideMembership,
  useMembershipRequests,
  useOrgDashboard,
  useOrgMembers,
} from '@/hooks/useOrg';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import { accentGradient, useColors } from '@/lib/theme';
import { formatDate } from '@/lib/format';
import { SUBSCRIPTION_PLANS, downloadCharge, formatCedis, isUnlimited } from '@/types/dawuro';

/**
 * The organisation itself: who it is, what it is paying, and who is on it.
 *
 * Deliberately not a copy of the console's billing page. An operator on a phone
 * is not going to change a plan or pay an invoice here — they are going to
 * check one of three things: are we approved, how much of this period's
 * allowance is gone, and who else is on this account. Everything else stays at
 * the desk, where it has the room and the keyboard.
 *
 * The personal account controls are the reporter's own component: a name, a
 * password and deleting the account belong to the person signed in, not to the
 * organisation, and they behave identically whichever experience they are shown
 * in. Duplicating them here would be two copies of a delete-account flow.
 */
export function OrgAccountScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const { data: dashboard, isPending, isError, error, refetch } = useOrgDashboard();
  const { data: members } = useOrgMembers();
  const { data: requests } = useMembershipRequests();
  const decideMembership = useDecideMembership();
  const [deciding, setDeciding] = useState<string | null>(null);

  /*
   * Only what is still waiting. A request already settled is history, and this
   * screen is a queue — leaving decided rows in it means an operator reads the
   * same names every time they open their organisation.
   */
  const pending = (requests ?? []).filter((r) => r.status === 'pending');

  /**
   * Settle one, and say which way it went.
   *
   * The toast names the person rather than saying "Saved": approving admits
   * somebody to an organisation that receives footage filed by the public, and
   * an operator who cannot tell whether it went through does it again.
   */
  const decide = async (requestId: string, who: string, decision: 'approved' | 'rejected') => {
    setDeciding(requestId);
    try {
      await decideMembership.mutateAsync({ requestId, decision });
      if (decision === 'approved') {
        toast.success(t('org.requestApprovedTitle'), t('org.requestApprovedBody', { name: who }));
      } else {
        toast.success(t('org.requestDeclinedTitle'), t('org.requestDeclinedBody', { name: who }));
      }
    } catch (cause) {
      toast.error(
        t('org.requestFailedTitle'),
        cause instanceof Error ? cause.message : t('common.unknownErrorHelp'),
      );
    } finally {
      setDeciding(null);
    }
  };

  const subscription = dashboard?.subscription ?? null;
  const tier = subscription?.tier ?? null;
  const plan = tier ? SUBSCRIPTION_PLANS[tier] : null;

  const seats = plan ? `${subscription?.seatsUsed ?? 0} / ${plan.seats}` : null;
  const perReport = plan
    ? isUnlimited(plan)
      ? t('org.includedInPlan')
      : formatCedis(downloadCharge(plan))
    : null;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Identity */}
      <View className="items-center gap-3 px-5 pb-5">
        <LinearGradient
          colors={[...accentGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 76,
            height: 76,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* White on the blue gradient, like the reporter's avatar. */}
          <Text variant="display-md" tone="on-dark" className="font-display">
            {(profile?.orgName ?? '?').charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
        <View className="items-center gap-1">
          <View className="flex-row items-center gap-2">
            <Text variant="title-lg">{profile?.orgName ?? t('org.title')}</Text>
            {profile?.orgVerified ? (
              <Ionicons name="checkmark-circle" size={18} color={c.info} />
            ) : null}
          </View>
          <Text variant="body-sm" tone="muted">
            {profile?.email ?? ''}
          </Text>
        </View>
        {profile?.role ? <Badge label={t(`org.role.${profile.role}`)} tone="accent" /> : null}
        {/*
          An unverified organisation is a real state, not an error: the platform
          has not approved it yet and the service refuses every organisation
          route but onboarding until it does. Saying so here is what stops the
          empty inbox behind this screen reading as a fault.
        */}
        {profile?.orgVerified === false ? (
          <Badge label={t('org.pendingApproval')} tone="warning" />
        ) : null}
      </View>

      {/* The plan */}
      <View className="gap-1.5 px-4 pb-4">
        <Text variant="label" tone="muted" className="px-1">
          {t('org.plan')}
        </Text>
        <Glass elevation="low" className="gap-0 rounded-lg">
          {isPending ? (
            <View className="gap-3 p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </View>
          ) : isError ? (
            /*
              An outage said "Not stated" six times over.

              Every row below falls back to that when a field is missing, which
              is right for a service that did not send one — and wrong for a
              service that did not answer at all. The two read identically, so a
              dead connection looked like an organisation whose plan nobody had
              filled in.
            */
            <View className="gap-3 p-4">
              <Text variant="body" className="font-sans-medium">
                {describeApiError(error, t, {
                  title: t('org.planUnavailableTitle'),
                  body: t('org.planUnavailableBody'),
                }).title}
              </Text>
              <Text variant="body-sm" tone="muted">
                {describeApiError(error, t, {
                  title: t('org.planUnavailableTitle'),
                  body: t('org.planUnavailableBody'),
                }).body}
              </Text>
              <Button
                label={t('common.retry')}
                variant="glass"
                onPress={() => void refetch()}
              />
            </View>
          ) : (
            <>
              {/*
                Every row here is omitted rather than guessed when the service
                did not say. A plan screen that renders "—" for a tier it did not
                recognise is honest; one that renders "basic" is a claim about
                somebody's bill.
              */}
              <SettingRow
                icon="pricetag-outline"
                label={t('org.tier')}
                value={tier ? t(`org.tierName.${tier}`) : t('org.unknownValue')}
              />
              <SettingRow
                icon="pulse-outline"
                label={t('org.subscriptionStatus')}
                value={
                  subscription?.status
                    ? t(`org.subscription.${subscription.status}`)
                    : t('org.unknownValue')
                }
              />
              <SettingRow
                icon="calendar-outline"
                label={t('org.renews')}
                value={formatDate(subscription?.renewsAtIso ?? null) ?? t('org.unknownValue')}
              />
              <SettingRow
                icon="ribbon-outline"
                label={t('org.licensedThisPeriod')}
                value={String(subscription?.reportsUsedThisPeriod ?? 0)}
              />
              <SettingRow
                icon="cash-outline"
                label={t('org.perReport')}
                value={perReport ?? t('org.unknownValue')}
              />
              <SettingRow
                icon="people-outline"
                label={t('org.seats')}
                value={seats ?? String(subscription?.seatsUsed ?? 0)}
                divider={false}
              />
            </>
          )}
        </Glass>
        <Text variant="caption" tone="faint" className="px-1 pt-1">
          {t('org.billingAtDesk')}
        </Text>
      </View>

      {/*
        People asking to join, above the team they are asking to join.

        **The phone could not answer this at all.** `GET
        /org/membership-requests` and its decide endpoint have existed
        throughout and no screen here read either, so an operator running their
        organisation from a phone — which is every operator, now that the
        organisation has its own shell — had to find a desktop to admit a
        colleague. The console has had the same queue for as long.

        Above the member list rather than below it, and only when somebody is
        waiting: a request is work, a member list is reference, and reference
        does not go first. It disappears entirely when the queue is empty,
        because a permanent "Nobody is waiting" is furniture.
      */}
      {pending.length > 0 ? (
        <View className="gap-1.5 px-4 pb-4">
          <Text variant="label" tone="muted" className="px-1">
            {t('org.requests')}
          </Text>
          <Glass elevation="low" className="gap-0 rounded-lg">
            <View className="border-b border-hairline/[0.08] px-4 py-3">
              <Text variant="caption" tone="muted">
                {t('org.requestsHelp')}
              </Text>
            </View>
            {pending.map((request) => {
              const who = request.displayName || request.email || request.id;
              const busy = deciding === request.id;
              return (
                <View
                  key={request.id}
                  className="gap-3 border-b border-hairline/[0.08] px-4 py-4"
                >
                  <View className="flex-row items-start gap-3">
                    <Ionicons name="person-add-outline" size={20} color={c.textMuted} />
                    <View className="flex-1 gap-0.5">
                      <Text variant="body" className="font-sans-medium">
                        {who}
                      </Text>
                      {request.email && request.displayName ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {request.email}
                        </Text>
                      ) : null}
                      {/*
                        What they say they do, marked as a claim. The service
                        calls it `statedRole` for the same reason: it is the
                        applicant's word, and the decision being made is
                        precisely whether to believe it.
                      */}
                      <Text variant="caption" tone={request.statedRole ? 'secondary' : 'faint'}>
                        {request.statedRole ?? t('org.requestNoRole')}
                      </Text>
                      {request.note ? (
                        <Text variant="caption" tone="muted" className="mt-1">
                          {request.note}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    <Button
                      label={t('org.requestApprove')}
                      size="sm"
                      loading={busy}
                      onPress={() => void decide(request.id, who, 'approved')}
                    />
                    <Button
                      label={t('org.requestDecline')}
                      size="sm"
                      variant="glass"
                      disabled={busy}
                      onPress={() => void decide(request.id, who, 'rejected')}
                    />
                  </View>
                </View>
              );
            })}
          </Glass>
        </View>
      ) : null}

      {/* The people */}
      <View className="gap-1.5 px-4 pb-4">
        <Text variant="label" tone="muted" className="px-1">
          {t('org.team')}
        </Text>
        <Glass elevation="low" className="gap-0 rounded-lg">
          {(members ?? []).length === 0 ? (
            <View className="p-4">
              <Text variant="body-sm" tone="muted">
                {t('org.noMembers')}
              </Text>
            </View>
          ) : (
            (members ?? []).map((member) => (
              <View
                key={member.userId}
                className="flex-row items-center gap-3 border-b border-hairline/[0.08] px-4 py-4"
              >
                <Ionicons name="person-circle-outline" size={22} color={c.textMuted} />
                <View className="flex-1">
                  <Text variant="body" className="font-sans-medium">
                    {member.displayName}
                  </Text>
                  {member.email ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {member.email}
                    </Text>
                  ) : null}
                </View>
                {member.role ? (
                  <Badge label={t(`org.role.${member.role}`)} tone="neutral" />
                ) : null}
              </View>
            ))
          )}
        </Glass>
      </View>

      {/* The person, as opposed to the organisation. */}
      <View className="gap-3 px-4">
        <AccountSettings />

        <Glass elevation="low" className="gap-0 rounded-lg">
          <SettingRow
            icon="log-out-outline"
            label={t('settings.signOut')}
            danger
            divider={false}
            onPress={() => {
              void signOut();
              toast.info(t('auth.signedOutTitle'), t('auth.signedOutBody'));
              router.replace('/(auth)/sign-in');
            }}
          />
        </Glass>
      </View>
    </ScrollView>
  );
}

/* `Row` was a third copy of `components/SettingRow` and is now that component. */
