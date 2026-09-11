import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Chip, EmptyState, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { ORGANISATION_APPLICATIONS, type OrganisationApplication } from '@/api/dawuroData';
import { categoryColor, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { DeskOnly } from './DeskOnly';
import { SUBSCRIPTION_PLANS, formatCedis } from '@/types/dawuro';

/**
 * Organisation approval.
 *
 * The gate between an organisation signing up and being able to see footage of
 * the public. Nothing self-activates.
 *
 * **The decision is not taken here.** This screen used to approve and reject,
 * which made it a second authority alongside the web console with nothing
 * saying which had actually decided. Granting a body access to citizens'
 * footage means reading a screening result and a set of documents, and that is
 * not work a phone should pretend to support — so the queue is visible and the
 * decision is at a desk. See `DeskOnly`.
 *
 * Applications carry flags an operator should weigh: a free-mail contact
 * address, an unverifiable registration number. Neither is disqualifying on its
 * own, which is exactly why a human looks rather than a rule deciding.
 */
export function OrganisationApprovalScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Read-only on the phone: nothing here changes an application's status.
  const applications = ORGANISATION_APPLICATIONS;
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [active, setActive] = useState<OrganisationApplication | null>(null);

  const visible = useMemo(
    () =>
      filter === 'pending' ? applications.filter((a) => a.status === 'pending') : applications,
    [applications, filter],
  );

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-lg">{t('platform.applications')}</Text>
            <Text variant="caption" tone="muted">
              {t('platform.pendingCount', {
                count: applications.filter((a) => a.status === 'pending').length,
              })}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          <Chip
            label={t('platform.pending')}
            selected={filter === 'pending'}
            onPress={() => setFilter('pending')}
          />
          <Chip
            label={t('common.all')}
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
          />
        </View>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={t('platform.noApplicationsTitle')}
          description={t('platform.noApplicationsBody')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-2 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((app) => (
            <Pressable
              key={app.id}
              onPress={() => setActive(app)}
              accessibilityLabel={app.organisationName}
            >
              <Glass elevation="low" className="gap-2.5 rounded-lg p-4">
                <View className="flex-row items-start gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise">
                    <Ionicons name="business" size={17} color={c.textMuted} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text variant="body" className="font-sans-semibold" numberOfLines={1}>
                      {app.organisationName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t(`sector.${app.sector}`)} · {formatRelativeTime(app.submittedAtIso)}
                    </Text>
                  </View>
                  {app.status === 'pending' ? (
                    <Badge label={t('platform.pending')} tone="warning" />
                  ) : app.status === 'approved' ? (
                    <Badge label={t('platform.approved')} tone="success" />
                  ) : (
                    <Badge label={t('platform.rejected')} tone="danger" />
                  )}
                </View>

                {app.flags.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {app.flags.map((flag) => (
                      <View
                        key={flag}
                        className="flex-row items-center gap-1.5 rounded-pill bg-warning-wash px-2.5 py-1"
                      >
                        <Ionicons name="warning-outline" size={11} color={c.warning} />
                        <Text variant="caption" tone="warning">
                          {t(`platform.flag.${flag}`)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View className="flex-row items-center gap-2 border-t border-hairline/[0.07] pt-2.5">
                  <Text variant="caption" tone="muted" className="flex-1">
                    {t(`organisation.tier.${app.requestedTier}`)} ·{' '}
                    {formatCedis(SUBSCRIPTION_PLANS[app.requestedTier].feePesewas, {
                      compact: true,
                    })}
                    /mo
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
                </View>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Review sheet */}
      <Sheet
        visible={active !== null}
        onClose={() => setActive(null)}
        title={active?.organisationName}
        subtitle={active ? t(`sector.${active.sector}`) : undefined}
      >
        {active ? (
          <View className="gap-4">
            <Glass elevation="low" raised={false} className="gap-0 rounded-lg">
              <Row label={t('organisation.contactName')} value={active.contactName} />
              <Row label={t('organisation.workEmail')} value={active.email} />
              <Row label={t('organisation.phone')} value={active.phone} />
              <Row
                label={t('organisation.registrationNumber')}
                value={active.registrationNumber}
                last
              />
            </Glass>

            <View className="gap-2">
              <Text variant="label" tone="muted">
                {t('organisation.interestsTitle')}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {active.interests.map((c) => (
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
            </View>

            {/* Stated at the point of decision, because this is the moment the
                consequence attaches to a person. */}
            <View className="flex-row items-start gap-2.5 rounded-lg bg-warning-wash p-3.5">
              <Ionicons name="eye-outline" size={16} color={c.warning} />
              <Text variant="caption" tone="warning" className="flex-1">
                {t('platform.approvalConsequence')}
              </Text>
            </View>

            {active.status === 'pending' ? (
              <DeskOnly reason={t('deskOnly.approval')} />
            ) : (
              <Badge
                label={
                  active.status === 'approved' ? t('platform.approved') : t('platform.rejected')
                }
                tone={active.status === 'approved' ? 'success' : 'danger'}
              />
            )}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      className={
        last
          ? 'flex-row items-center justify-between px-4 py-3'
          : 'flex-row items-center justify-between border-b border-hairline/[0.07] px-4 py-3'
      }
    >
      <Text variant="body-sm" tone="muted">
        {label}
      </Text>
      <Text variant="body-sm" className="font-sans-medium" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
