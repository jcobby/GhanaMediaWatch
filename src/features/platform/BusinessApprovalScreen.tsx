import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, EmptyState, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { BUSINESS_APPLICATIONS, type BusinessApplication } from '@/api/dawuroData';
import { categoryColor, colors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { SUBSCRIPTION_PLANS, formatCedis } from '@/types/dawuro';
import { toast } from '@/stores/toastStore';

/**
 * Business approval.
 *
 * The gate between an organisation signing up and being able to see footage of
 * the public. Nothing self-activates, so this screen is the only path to a live
 * business account — and it is deliberately a considered one rather than a
 * two-button queue.
 *
 * Applications carry flags an operator should weigh: a free-mail contact
 * address, an unverifiable registration number. Neither is disqualifying on its
 * own, which is exactly why a human looks rather than a rule deciding.
 */
export function BusinessApprovalScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [applications, setApplications] = useState(BUSINESS_APPLICATIONS);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [active, setActive] = useState<BusinessApplication | null>(null);

  const visible = useMemo(
    () =>
      filter === 'pending' ? applications.filter((a) => a.status === 'pending') : applications,
    [applications, filter],
  );

  const decide = useCallback(
    (id: string, status: 'approved' | 'rejected') => {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      setActive(null);
      if (status === 'approved') {
        toast.success(t('platform.approvedTitle'), t('platform.approvedBody'));
      } else {
        toast.info(t('platform.rejectedAppTitle'), t('platform.rejectedAppBody'));
      }
    },
    [t],
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
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
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
                    <Ionicons name="business" size={17} color={colors.textMuted} />
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
                        <Ionicons name="warning-outline" size={11} color={colors.warning} />
                        <Text variant="caption" tone="warning">
                          {t(`platform.flag.${flag}`)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View className="flex-row items-center gap-2 border-t border-hairline/[0.07] pt-2.5">
                  <Text variant="caption" tone="muted" className="flex-1">
                    {t(`business.tier.${app.requestedTier}`)} ·{' '}
                    {formatCedis(SUBSCRIPTION_PLANS[app.requestedTier].monthlyPesewas, {
                      compact: true,
                    })}
                    /mo
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
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
              <Row label={t('business.contactName')} value={active.contactName} />
              <Row label={t('business.workEmail')} value={active.email} />
              <Row label={t('business.phone')} value={active.phone} />
              <Row
                label={t('business.registrationNumber')}
                value={active.registrationNumber}
                last
              />
            </Glass>

            <View className="gap-2">
              <Text variant="label" tone="muted">
                {t('business.interestsTitle')}
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
              <Ionicons name="eye-outline" size={16} color={colors.warning} />
              <Text variant="caption" tone="warning" className="flex-1">
                {t('platform.approvalConsequence')}
              </Text>
            </View>

            {active.status === 'pending' ? (
              <View className="flex-row gap-2">
                <Button
                  label={t('platform.reject')}
                  variant="glass"
                  className="flex-1"
                  onPress={() => decide(active.id, 'rejected')}
                />
                <Button
                  label={t('platform.approve')}
                  className="flex-[2]"
                  onPress={() => decide(active.id, 'approved')}
                />
              </View>
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
