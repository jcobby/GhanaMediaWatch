import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Glass,
  Pressable,
  Sheet,
  SkeletonList,
  Text,
} from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useOrgAssignments, useUpdateAssignment } from '@/hooks/useOrg';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import { useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { ASSIGNMENT_STATUSES, type AssignmentStatus, type OrgAssignment } from '@/types/org';
import { OrgHeader } from './OrgHeader';

/**
 * Who has been sent where, and how far they have got.
 *
 * The one organisation screen that is genuinely better on a phone than at a
 * desk, in both directions: a dispatcher standing in a corridor can see that
 * nobody has accepted the Kaneshie job, and the officer who was sent can mark
 * themselves on scene from the street rather than from an office they are not
 * in.
 *
 * Reopening a closed assignment is allowed by the service, so the statuses are
 * offered as a list rather than as a one-way ladder — a job closed by mistake
 * is a thing that happens, and a client that only moved forward would make it
 * unfixable from here.
 */
const STATUS_TONE: Record<AssignmentStatus, 'neutral' | 'accent' | 'warning' | 'success'> = {
  assigned: 'neutral',
  accepted: 'accent',
  en_route: 'warning',
  on_scene: 'warning',
  closed: 'success',
};

const STATUS_ICON: Record<AssignmentStatus, keyof typeof Ionicons.glyphMap> = {
  assigned: 'mail-outline',
  accepted: 'checkmark-outline',
  en_route: 'car-outline',
  on_scene: 'location-outline',
  closed: 'checkmark-done-outline',
};

export function OrgDispatchScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const orgName = useAuthStore((s) => s.profile?.orgName);

  const { data, isPending, isError, error, refetch, isRefetching } = useOrgAssignments();
  const update = useUpdateAssignment();
  const [moving, setMoving] = useState<OrgAssignment | null>(null);

  const assignments = useMemo(() => data ?? [], [data]);

  /*
   * Open work first, closed work last.
   *
   * A dispatch board read top to bottom should put the jobs nobody has picked
   * up above the ones already finished; sorting by date alone buries an
   * unaccepted assignment under this morning's closures.
   */
  const ordered = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const rank = (s: AssignmentStatus) => (s === 'closed' ? 1 : 0);
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        return b.updatedAt.localeCompare(a.updatedAt);
      }),
    [assignments],
  );

  const failure = describeApiError(error, t, {
    title: t('org.dispatchErrorTitle'),
    body: t('org.inboxErrorBody'),
  });

  const move = (assignment: OrgAssignment, status: AssignmentStatus) => {
    setMoving(null);
    update.mutate(
      { id: assignment.id, status },
      {
        onSuccess: () =>
          toast.success(
            t('org.dispatchMovedTitle'),
            t('org.dispatchMovedBody', {
              name: assignment.employeeName || t('org.someone'),
              status: t(`org.assignment.${status}`),
            }),
          ),
        onError: (cause) => {
          const copy = describeApiError(cause, t, {
            title: t('org.dispatchFailedTitle'),
            body: t('org.dispatchFailedBody'),
          });
          toast.error(copy.title, copy.body);
        },
      },
    );
  };

  return (
    <>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={c.accent}
          />
        }
      >
        <OrgHeader title={orgName ?? t('org.title')} subtitle={t('org.dispatch')} />

        <View className="gap-2 px-4">
          {isPending ? (
            <SkeletonList count={3} />
          ) : isError ? (
            <ErrorState
              title={failure.title}
              description={failure.body}
              retryLabel={t('common.retry')}
              onRetry={() => void refetch()}
            />
          ) : ordered.length === 0 ? (
            <EmptyState
              icon="navigate-outline"
              title={t('org.noDispatchTitle')}
              description={t('org.noDispatchBody')}
            />
          ) : (
            ordered.map((assignment) => (
              <Glass key={assignment.id} elevation="low" className="gap-3 rounded-lg p-4">
                <View className="flex-row items-start gap-3">
                  <Ionicons
                    name={STATUS_ICON[assignment.status]}
                    size={18}
                    color={assignment.status === 'closed' ? c.success : c.textMuted}
                  />
                  <View className="flex-1 gap-1">
                    <Text variant="body" className="font-sans-medium">
                      {assignment.employeeName || t('org.someone')}
                    </Text>
                    {assignment.note ? (
                      <Text variant="body-sm" tone="muted">
                        {assignment.note}
                      </Text>
                    ) : null}
                    <Text variant="caption" tone="faint">
                      {t('org.updatedAgo', {
                        ago: formatRelativeTime(assignment.updatedAt) ?? '—',
                      })}
                    </Text>
                  </View>
                  <Badge
                    label={t(`org.assignment.${assignment.status}`)}
                    tone={STATUS_TONE[assignment.status]}
                  />
                </View>
                <Button
                  label={t('org.moveDispatch')}
                  variant="glass"
                  size="md"
                  fullWidth
                  loading={update.isPending && moving?.id === assignment.id}
                  onPress={() => setMoving(assignment)}
                />
              </Glass>
            ))
          )}
        </View>
      </ScrollView>

      <Sheet
        visible={moving !== null}
        onClose={() => setMoving(null)}
        title={t('org.moveDispatch')}
        subtitle={moving?.employeeName || undefined}
      >
        <View className="gap-2">
          {ASSIGNMENT_STATUSES.map((status) => (
            <Pressable
              key={status}
              onPress={() => moving && move(moving, status)}
              accessibilityLabel={t(`org.assignment.${status}`)}
              accessibilityState={{ selected: moving?.status === status }}
              className="flex-row items-center gap-3 rounded-lg bg-glass/[0.08] px-4 py-5"
            >
              <Ionicons name={STATUS_ICON[status]} size={20} color={c.textMuted} />
              <Text variant="body-lg" className="flex-1 font-sans-medium">
                {t(`org.assignment.${status}`)}
              </Text>
              {moving?.status === status ? (
                <Ionicons name="checkmark" size={18} color={c.accent} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}
