import { Alert, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Text } from '@/components/ui';
import { IncidentStage } from '@/features/incident/IncidentStage';
import { ReportOutcomeTimeline } from './ReportOutcome';
import { useReportOutcome } from '@/hooks/useReportOutcome';
import { useDeleteIncident } from '@/hooks/useIncidents';
import { toast } from '@/stores/toastStore';
import { categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import type { AuthoredIncident, VettingState } from '@/types/api';

const STATE_TONE: Record<VettingState, 'success' | 'warning' | 'danger' | 'info'> = {
  published: 'success',
  pending_review: 'warning',
  rejected: 'danger',
  restricted: 'info',
};

/**
 * One of the reporter's own reports, in full.
 *
 * This showed the outcome timeline and nothing else — four lines saying where a
 * report had got to, with no sight of the thing itself. A reporter tapping
 * their own footage expects to watch it back, and the tile they tapped had just
 * shown them a thumbnail of it.
 *
 * **Built from the record the list already holds, not from a second request.**
 * `GET /me/incidents` is documented as the caller's own incidents "across all
 * states" and carries the media, the description, the destination and the
 * vetting state. The public `GET /incidents/{id}` serves published reports, so
 * routing to the public detail screen would work for exactly the reports a
 * reporter is least worried about and refuse the ones under review — which is
 * the half this screen exists for.
 *
 * Still a sheet rather than a route, for the reason it always was: somebody
 * checking on a report in a list expects to come back to the same place in it.
 * A published report gets a link out to its public page, where the comments and
 * reactions live.
 */
export function ReportSheetBody({
  report,
  onWithdrawn,
}: {
  report: AuthoredIncident;
  /** Closes the sheet: the report it was showing no longer exists. */
  onWithdrawn?: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const { height: screenH } = useWindowDimensions();
  const { data: outcome } = useReportOutcome(report.id);
  const { mutate: remove, isPending: deleting } = useDeleteIncident();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerClassName="gap-4 pb-4"
      /*
       * The player's transport takes taps, and a scroll view above it will
       * otherwise claim them as the start of a drag. `handled` lets the child
       * respond first, which is what a scrubber needs.
       */
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/*
        The footage, playable.

        A portrait frame: phone captures are portrait, and `contain` inside it
        means nothing is cropped — the parts cut off by a landscape box may be
        the parts that matter.

        Capped at half the screen, because 3:4 of the full width is taller than
        the sheet it sits in. Unbounded, it put every other thing this sheet
        exists to show — the state, the reason for a rejection, where the report
        went — below the fold of a panel that could not be scrolled or closed.
        `contain` means the cap costs nothing but scale.
      */}
      <View
        style={{ maxHeight: screenH * 0.5 }}
        className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-black"
      >
        <IncidentStage incident={report} failed={false} onFailed={() => {}} />
      </View>

      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <View
            style={{ backgroundColor: categoryHue(report.category) }}
            className="h-1.5 w-1.5 rounded-pill"
          />
          <Text variant="caption" tone="muted" className="uppercase">
            {t(`category.${report.category}`)}
          </Text>
          <Badge
            label={t(`vetting.${report.vettingState}`)}
            tone={STATE_TONE[report.vettingState]}
          />
          {/* When it was filed. `publishedAt` is null until an editor runs it,
              so it rendered nothing at all on exactly the reports in review. */}
          <Text variant="caption" tone="faint">
            {formatRelativeTime(report.createdAt)}
          </Text>
        </View>

        <Text variant="body">{report.description}</Text>

        {/*
          The reason, verbatim.

          A rejection reason is written for this reporter about this report.
          Summarising it into a generic failure removes the only part of a
          rejection anybody can act on.
        */}
        {report.rejectionReason ? (
          <View className="rounded-sm bg-danger-wash p-3">
            <Text variant="caption" tone="danger">
              {report.rejectionReason}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="gap-1.5 rounded-lg bg-canvas-raise p-3.5">
        <Detail
          icon="location-outline"
          /*
            The server's resolved place name, or nothing.

            `landmark` is on the editorial projection of a report and is not
            declared on what `/me/incidents` returns, so reading it here would
            be claiming a field this client has not verified arrives.
          */
          label={report.location.label ?? t('detail.locationHidden')}
        />
        {report.capturedAtIso ? (
          <Detail icon="time-outline" label={`${formatRelativeTime(report.capturedAtIso)}`} />
        ) : null}
        <Detail
          icon={report.isAnonymous ? 'eye-off-outline' : 'person-outline'}
          label={report.isAnonymous ? t('common.anonymous') : t('profile.publishedAsYou')}
        />
      </View>

      {/*
        What became of it — the timeline this sheet used to be.

        Filed *at* `createdAt`, not `publishedAt`: the second is null for every
        report still in review, which is most of the ones anybody opens this
        sheet to check on. It printed an undated "You filed this".
      */}
      <ReportOutcomeTimeline
        outcome={outcome ?? null}
        filedAtIso={report.createdAt}
        destination={report.destination}
        vettingState={report.vettingState}
        publishedAtIso={report.publishedAt}
      />

      {/*
        Out to the public page, only where there is one.

        Comments and reactions live on the published report. Offering the link
        on something still under review would send a reporter to a 404 about
        their own footage.
      */}
      {report.vettingState === 'published' ? (
        <Button
          label={t('profile.openPublic')}
          variant="glass"
          fullWidth
          onPress={() => router.push(`/incident/${report.id}`)}
        />
      ) : null}

      {/*
        Withdrawing it, which only the person who filed it can do.

        The service refuses this to everybody else — an editor cannot remove a
        report and neither can an organisation it was routed to — so this
        control exists on exactly one screen in the product, and this is it.

        Below the rest, and quiet. It is the one irreversible thing in the
        sheet, and a reporter opens this to check on a report far more often
        than to take one down.
      */}
      <Button
        label={t(deleting ? 'profile.withdrawing' : 'profile.withdraw')}
        variant="danger"
        fullWidth
        disabled={deleting}
        onPress={confirmWithdraw}
      />
    </ScrollView>
  );

  /**
   * Ask first, and be accurate about what happens.
   *
   * The delete is *soft* on the service: the record survives for lawful process
   * and for any organisation that already licensed it. Promising a reporter
   * that their footage is gone would be a promise the platform cannot keep, and
   * it is exactly the sort somebody decides to act on.
   */
  function confirmWithdraw() {
    Alert.alert(t('profile.withdrawTitle'), t('profile.withdrawBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.withdraw'),
        style: 'destructive',
        onPress: () => {
          remove(report.id, {
            onSuccess: () => {
              toast.success(t('profile.withdrawnTitle'), t('profile.withdrawnBody'));
              onWithdrawn?.();
            },
            onError: (error) => {
              /*
               * The server's own refusal, because the interesting case is a 403
               * — this account is not the author — and a generic failure would
               * send somebody looking at their connection.
               */
              toast.error(
                t('profile.withdrawFailedTitle'),
                error instanceof Error ? error.message : t('common.unknownErrorHelp'),
              );
            },
          });
        },
      },
    ]);
  }

  function Detail({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
    return (
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={13} color={c.textFaint} />
        <Text variant="caption" tone="muted" className="flex-1">
          {label}
        </Text>
      </View>
    );
  }
}
