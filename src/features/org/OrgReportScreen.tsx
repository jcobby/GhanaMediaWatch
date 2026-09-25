import { useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { IncidentStage } from '@/features/incident/IncidentStage';
import {
  useCreateAssignment,
  useLicenseIncident,
  useOrgDashboard,
  useOrgIncident,
  useOrgInbox,
  useOrgMembers,
  useRequestPublication,
  useRespondToIncident,
  useSetOrgIncidentStatus,
} from '@/hooks/useOrg';
import { toast } from '@/stores/toastStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import { categoryHue, useColors } from '@/lib/theme';
import { formatDate, formatDistance, formatRelativeTime } from '@/lib/format';
import { SUBSCRIPTION_PLANS, downloadCharge, formatCedis, isUnlimited } from '@/types/dawuro';
import { NEWS_SECTIONS, type NewsSection } from '@/types/sections';
import {
  ORG_INCIDENT_STATUSES,
  ORG_RESPONSE_ACTIONS,
  type OrgIncidentStatus,
  type OrgResponseAction,
} from '@/types/org';

/**
 * One routed report, and everything an organisation can do about it.
 *
 * A full screen rather than a sheet. There are five decisions here — license,
 * answer the reporter, record an internal status, send somebody, ask an editor
 * to run it — and a sheet that holds five of anything is a sheet you scroll
 * past the thing you came for.
 *
 * The order is deliberate and it is the order of the day: what is it, do we buy
 * it, what do we tell the person who filmed it, who goes, does it run. Only the
 * last is gated on the licence, and the service is what gates it — the button
 * is hidden rather than left to fail, because "Send to the editor" that answers
 * 403 teaches nothing about why.
 */
export function OrgReportScreen({ incidentId }: { incidentId: string }) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  /*
   * Whether the footage could be opened.
   *
   * `IncidentStage` reports it rather than swallowing it, because the failures
   * are not interchangeable — nothing uploaded, a file too small to be footage,
   * an expired URL — and an organisation about to spend money on a clip needs to
   * see which one it is instead of a black rectangle.
   */
  const [mediaFailed, setMediaFailed] = useState(false);

  /*
   * A sheet's list must not grow past half the screen.
   *
   * `Sheet` caps its own height and lets the body shrink, but a `ScrollView`
   * with no bounded height inside a shrinking parent does not scroll — it is
   * simply clipped. The response sheet is six options, a note field and a send
   * button, which is taller than a small phone, so without this the button you
   * are reaching for cannot be reached.
   */
  const sheetListHeight = Math.round(screenH * 0.5);

  /*
   * Read out of the inbox rather than fetched on its own.
   *
   * `GET /org/incidents/{id}` exists and would work, but the officer arrived
   * here by tapping a row that is already in the cache — a second request buys
   * a spinner over content the phone is holding. The inbox query is shared, so
   * licensing on this screen updates the list behind it without a refetch of
   * this one.
   */
  const { data, isPending: inboxPending, isError, error, refetch } = useOrgInbox();
  const fromInbox = useMemo(
    () => data?.items.find((item) => item.id === incidentId) ?? null,
    [data, incidentId],
  );

  /*
   * Asked for on its own only when the inbox page does not hold it.
   *
   * The inbox is one page of fifty, so a report opened from a notification or
   * after the queue has moved on is not in it. Answering that with "That report
   * isn't here" would be wrong about a report this organisation may hold a
   * licence on.
   */
  const single = useOrgIncident(incidentId, !inboxPending && fromInbox === null);
  const report = fromInbox ?? single.data ?? null;
  const isPending = inboxPending || (fromInbox === null && single.isPending && single.isFetching);

  /*
   * The stage, and the number is arithmetic rather than a class.
   *
   * It was `h-56`, a class no other file in this project used — and NativeWind
   * builds the stylesheet from the class names present when Metro boots, so a
   * new one is absent until Metro is restarted, with no warning and no error.
   * Sizing through `style` is what every other media box here does and it
   * cannot fail this way.
   *
   * Two sizes, because the two jobs differ. A photo is read at a glance and a
   * quarter of the screen is enough, leaving the facts and the licence button
   * in view. A video is *watched* — it carries native transport controls, and
   * the whole question on this screen is whether the footage is worth buying,
   * which nobody answers from a letterbox.
   */
  const stageHeight = Math.round(
    report?.media.kind === 'video'
      ? Math.min(400, Math.max(260, screenH * 0.42))
      : Math.min(280, Math.max(180, screenH * 0.28)),
  );

  const { data: dashboard } = useOrgDashboard();
  const { data: members } = useOrgMembers();

  const license = useLicenseIncident();
  const respond = useRespondToIncident();
  const setStatus = useSetOrgIncidentStatus();
  const assign = useCreateAssignment();
  const publish = useRequestPublication();

  const [respondOpen, setRespondOpen] = useState(false);
  const [responseAction, setResponseAction] = useState<OrgResponseAction>('acknowledged');

  /*
   * A note per sheet, not one note for all three.
   *
   * They were sharing a single `note`, so a line written for the reporter — who
   * reads it under their own report — was still in the box when the dispatch
   * sheet opened, and would have been sent to a colleague as their briefing.
   * Three destinations, three drafts.
   */
  const [reporterNote, setReporterNote] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [editorNote, setEditorNote] = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  /*
   * No poster is cut from the clip here.
   *
   * `useVideoPoster` exists so a *list* can show a frame without opening the
   * video. This screen opens it, so seeking a still would be a second decode of
   * footage that is already playing.
   */

  const tier = dashboard?.subscription?.tier ?? null;
  const plan = tier ? SUBSCRIPTION_PLANS[tier] : null;
  /*
   * What this tap will cost, before it is tapped.
   *
   * Null when the tier is unknown, and the confirmation then says the price is
   * unknown rather than quoting a number. An organisation that is told a
   * licence is free and finds it on the invoice has been misled by this screen.
   */
  const price = plan ? (isUnlimited(plan) ? null : downloadCharge(plan)) : undefined;

  const failure = describeApiError(error, t, {
    title: t('org.inboxErrorTitle'),
    body: t('org.inboxErrorBody'),
  });

  const reportFailure = (cause: unknown, titleKey: string, bodyKey: string) => {
    const copy = describeApiError(cause, t, { title: t(titleKey), body: t(bodyKey) });
    toast.error(copy.title, copy.body);
  };

  /*
   * Licensing is asked twice, because it is a purchase.
   *
   * The confirmation names the price where the plan is known and says so where
   * it is not. Everything else on this screen is reversible or free; this one
   * charges the organisation and pays the reporter, and both of those are hard
   * to undo from a phone.
   */
  const confirmLicense = () => {
    if (!report) return;
    Alert.alert(
      t('org.licenseTitle'),
      price === undefined
        ? t('org.licenseBodyUnknownPrice')
        : price === null
          ? t('org.licenseBodyIncluded')
          : t('org.licenseBody', { amount: formatCedis(price) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('org.licenseConfirm'),
          onPress: () =>
            license.mutate(report.id, {
              onSuccess: (result) =>
                toast.success(
                  t('org.licensedTitle'),
                  t('org.licensedBody', {
                    reporter: formatCedis(result.reporterPesewas),
                  }),
                ),
              onError: (cause) =>
                reportFailure(cause, 'org.licenseFailedTitle', 'org.licenseFailedBody'),
            }),
        },
      ],
    );
  };

  const sendResponse = () => {
    if (!report) return;
    const text = reporterNote.trim();
    respond.mutate(
      { incidentId: report.id, action: responseAction, ...(text ? { note: text } : {}) },
      {
        onSuccess: () => {
          setRespondOpen(false);
          setReporterNote('');
          toast.success(t('org.respondedTitle'), t('org.respondedBody'));
        },
        onError: (cause) => reportFailure(cause, 'org.respondFailedTitle', 'org.respondFailedBody'),
      },
    );
  };

  const sendStatus = (status: OrgIncidentStatus) => {
    if (!report) return;
    setStatusOpen(false);
    setStatus.mutate(
      { incidentId: report.id, status },
      {
        onSuccess: () =>
          toast.success(
            t('org.statusSavedTitle'),
            t('org.statusSavedBody', { status: t(`org.status.${status}`) }),
          ),
        onError: (cause) => reportFailure(cause, 'org.statusFailedTitle', 'org.statusFailedBody'),
      },
    );
  };

  const dispatchTo = (assigneeId: string, name: string) => {
    if (!report) return;
    const text = dispatchNote.trim();
    setAssignOpen(false);
    assign.mutate(
      { incidentId: report.id, assigneeId, ...(text ? { note: text } : {}) },
      {
        onSuccess: () => {
          setDispatchNote('');
          toast.success(t('org.dispatchedTitle'), t('org.dispatchedBody', { name }));
        },
        onError: (cause) => reportFailure(cause, 'org.dispatchFailedTitle', 'org.dispatchFailedBody'),
      },
    );
  };

  const askEditor = (section: NewsSection) => {
    if (!report) return;
    const text = editorNote.trim();
    setPublishOpen(false);
    publish.mutate(
      { incidentId: report.id, section, ...(text ? { note: text } : {}) },
      {
        onSuccess: () => {
          setEditorNote('');
          toast.info(t('org.publishRequestedTitle'), t('org.publishRequestedBody'));
        },
        onError: (cause) => reportFailure(cause, 'org.publishFailedTitle', 'org.publishFailedBody'),
      },
    );
  };

  if (isPending) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 24 }}>
        <SkeletonList count={4} />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-canvas">
        <ErrorState
          title={failure.title}
          description={failure.body}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!report) {
    return (
      <View className="flex-1 bg-canvas">
        <EmptyState
          icon="help-circle-outline"
          title={t('org.reportGoneTitle')}
          description={t('org.reportGoneBody')}
          actionLabel={t('org.backToInbox')}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3 px-4 pb-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('org.backToInbox')}
            style={{ width: 44, height: 44 }}
            className="items-center justify-center rounded-pill bg-glass/[0.08]"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <Text variant="title-md" className="flex-1" numberOfLines={1}>
            {report.reportId}
          </Text>
          {report.licensed ? <Badge label={t('org.licensed')} tone="success" /> : null}
        </View>

        {/*
          The footage, playing.

          This was a `Thumbnail` — a still — on the argument that licensing is a
          glance and an autoplaying clip costs an officer data. That argument was
          wrong, and it was wrong about the one decision this screen exists for:
          you cannot judge whether to buy footage you cannot watch. A video
          report showed a frozen frame with no way to play it, which is exactly
          the failure `IncidentStage` was written to end on the reader's side.

          The same component as the public detail screen and the reporter's own
          sheet, so the buffering, the expired-URL failure and the "this file is
          8 KB of filler" case are all handled here the way they are everywhere
          else, rather than a fourth time.
        */}
        <View
          style={{ height: stageHeight }}
          className="mx-4 overflow-hidden rounded-lg bg-canvas-raise"
        >
          <IncidentStage incident={report} failed={mediaFailed} onFailed={setMediaFailed} />
          {/* The category stripe takes no touches: the player's own controls run
              the full width underneath it, and a 3pt strip that swallows taps
              at the left edge is a scrubber that stops working there. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 3,
              backgroundColor: categoryHue(report.category),
            }}
          />
        </View>

        <View className="gap-1.5 px-4 py-4">
          <Text variant="label" tone="muted">
            {t(`category.${report.category}`)}
          </Text>
          <Text variant="title-md">{report.description}</Text>
        </View>

        {/* The facts a licensing decision turns on. */}
        <View className="px-4 pb-4">
          <Glass elevation="low" className="gap-0 rounded-lg">
            <Fact
              icon="location-outline"
              label={t('org.factPlace')}
              value={report.location.label ?? t('org.locationHidden')}
            />
            <Fact
              icon="time-outline"
              label={t('org.factCaptured')}
              value={
                formatDate(report.capturedAtIso) ??
                formatRelativeTime(report.publishedAt) ??
                t('org.timeHidden')
              }
            />
            {report.distanceM !== undefined ? (
              <Fact
                icon="navigate-outline"
                label={t('org.factDistance')}
                value={formatDistance(report.distanceM)}
              />
            ) : null}
            <Fact
              icon="person-outline"
              label={t('org.factReporter')}
              value={
                report.reporter.kind === 'user'
                  ? report.reporter.displayName
                  : t('org.anonymousReporter')
              }
            />
            {report.licensed ? (
              <Fact
                icon="ribbon-outline"
                label={t('org.factLicensed')}
                value={
                  report.licensedAt
                    ? (formatDate(report.licensedAt) ?? t('org.licensedDateUnknown'))
                    : t('org.licensedDateUnknown')
                }
              />
            ) : null}
          </Glass>
        </View>

        {/* Licensing, and what it pays. */}
        {!report.licensed ? (
          <View className="gap-3 px-4 pb-4">
            <Glass elevation="low" className="gap-2 rounded-lg p-4">
              <Text variant="body" className="font-sans-medium">
                {t('org.licenseHeading')}
              </Text>
              <Text variant="body-sm" tone="muted">
                {price === undefined
                  ? t('org.licenseBodyUnknownPrice')
                  : price === null
                    ? t('org.licenseBodyIncluded')
                    : t('org.licenseBody', { amount: formatCedis(price) })}
              </Text>
            </Glass>
            <Button
              label={t('org.licenseAction')}
              size="lg"
              fullWidth
              loading={license.isPending}
              onPress={confirmLicense}
              leading={<Ionicons name="ribbon-outline" size={18} color={c.textOnDark} />}
            />
          </View>
        ) : null}

        <View className="gap-3 px-4">
          <Text variant="label" tone="muted" className="px-1">
            {t('org.actions')}
          </Text>

          <Button
            label={t('org.respondAction')}
            variant="glass"
            size="lg"
            fullWidth
            onPress={() => setRespondOpen(true)}
            leading={<Ionicons name="chatbubble-outline" size={18} color={c.textPrimary} />}
          />
          <Button
            label={t('org.dispatchAction')}
            variant="glass"
            size="lg"
            fullWidth
            loading={assign.isPending}
            onPress={() => setAssignOpen(true)}
            leading={<Ionicons name="navigate-outline" size={18} color={c.textPrimary} />}
          />
          <Button
            label={t('org.statusAction')}
            variant="glass"
            size="lg"
            fullWidth
            loading={setStatus.isPending}
            onPress={() => setStatusOpen(true)}
            leading={<Ionicons name="bookmark-outline" size={18} color={c.textPrimary} />}
          />
          {/*
            Publishing is offered only on a licensed report, because that is the
            service's rule and not this screen's. Showing it regardless would be
            a button whose only outcome is a refusal nobody can explain.
          */}
          {report.licensed ? (
            <Button
              label={t('org.publishAction')}
              variant="glass"
              size="lg"
              fullWidth
              loading={publish.isPending}
              onPress={() => setPublishOpen(true)}
              leading={<Ionicons name="megaphone-outline" size={18} color={c.textPrimary} />}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* ── answering the reporter ─────────────────────────────────────── */}
      <Sheet
        visible={respondOpen}
        onClose={() => setRespondOpen(false)}
        title={t('org.respondAction')}
        subtitle={t('org.respondHelp')}
      >
        <ScrollView
          style={{ maxHeight: sheetListHeight }}
          showsVerticalScrollIndicator={false}
          /* Without this the first tap only dismisses the keyboard, so sending
             a reply you have just typed takes two taps on the same button. */
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2 pb-2">
            {ORG_RESPONSE_ACTIONS.map((action) => (
              <Pressable
                key={action}
                onPress={() => setResponseAction(action)}
                accessibilityLabel={t(`org.response.${action}`)}
                accessibilityState={{ selected: responseAction === action }}
                className={
                  responseAction === action
                    ? 'flex-row items-center gap-3 rounded-lg border border-accent/60 bg-accent-wash px-4 py-4'
                    : 'flex-row items-center gap-3 rounded-lg bg-glass/[0.08] px-4 py-4'
                }
              >
                <Text variant="body-lg" className="flex-1 font-sans-medium">
                  {t(`org.response.${action}`)}
                </Text>
                {responseAction === action ? (
                  <Ionicons name="checkmark" size={18} color={c.accent} />
                ) : null}
              </Pressable>
            ))}
            <NoteField
              value={reporterNote}
              onChange={setReporterNote}
              placeholder={t('org.notePlaceholder')}
            />
            <Button
              label={t('org.sendResponse')}
              size="lg"
              fullWidth
              loading={respond.isPending}
              onPress={sendResponse}
            />
          </View>
        </ScrollView>
      </Sheet>

      {/* ── sending somebody ───────────────────────────────────────────── */}
      <Sheet
        visible={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={t('org.dispatchAction')}
        subtitle={t('org.dispatchHelp')}
      >
        <ScrollView
          style={{ maxHeight: sheetListHeight }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2 pb-2">
            {/*
              The briefing is written before the name is tapped.

              Tapping a colleague sends the dispatch immediately — there is no
              confirm step, because on a phone the fewer taps between "who goes"
              and them being told, the better. That makes a note field *under*
              the list a box nobody ever gets back to, so it sits above it.
            */}
            <NoteField
              value={dispatchNote}
              onChange={setDispatchNote}
              placeholder={t('org.dispatchNotePlaceholder')}
            />
            {(members ?? []).length === 0 ? (
              <Text variant="body-sm" tone="muted" className="px-1 py-4">
                {t('org.noMembers')}
              </Text>
            ) : (
              (members ?? []).map((member) => (
                <Pressable
                  key={member.userId}
                  onPress={() => dispatchTo(member.userId, member.displayName)}
                  accessibilityLabel={member.displayName}
                  className="flex-row items-center gap-3 rounded-lg bg-glass/[0.08] px-4 py-4"
                >
                  <Ionicons name="person-circle-outline" size={22} color={c.textMuted} />
                  <View className="flex-1">
                    <Text variant="body-lg" className="font-sans-medium">
                      {member.displayName}
                    </Text>
                    {member.role ? (
                      <Text variant="caption" tone="muted">
                        {t(`org.role.${member.role}`)}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </Sheet>

      {/* ── the internal record ────────────────────────────────────────── */}
      <Sheet
        visible={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={t('org.statusAction')}
        subtitle={t('org.statusHelp')}
      >
        <View className="gap-2">
          {ORG_INCIDENT_STATUSES.map((status) => (
            <Pressable
              key={status}
              onPress={() => sendStatus(status)}
              accessibilityLabel={t(`org.status.${status}`)}
              className="flex-row items-center gap-3 rounded-lg bg-glass/[0.08] px-4 py-5"
            >
              <Text variant="body-lg" className="flex-1 font-sans-medium">
                {t(`org.status.${status}`)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* ── asking an editor to run it ─────────────────────────────────── */}
      <Sheet
        visible={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={t('org.publishAction')}
        subtitle={t('org.publishHelp')}
      >
        <ScrollView
          style={{ maxHeight: sheetListHeight }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2 pb-2">
            {/* Above the desks for the same reason as the dispatch note: picking
                a desk sends the request. */}
            <NoteField
              value={editorNote}
              onChange={setEditorNote}
              placeholder={t('org.editorNotePlaceholder')}
            />
            {/* The desk is required — the service rejects a publish without one
                and invents none, so it is chosen here rather than defaulted. */}
            {NEWS_SECTIONS.map((section) => (
              <Pressable
                key={section}
                onPress={() => askEditor(section)}
                accessibilityLabel={t(`section.${section}`)}
                className="flex-row items-center gap-3 rounded-lg bg-glass/[0.08] px-4 py-5"
              >
                <Text variant="body-lg" className="flex-1 font-sans-medium">
                  {t(`section.${section}`)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Sheet>
    </>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <View className="flex-row items-center gap-3 border-b border-hairline/[0.08] px-4 py-4">
      <Ionicons name={icon} size={18} color={c.textMuted} />
      <Text variant="body" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="body" numberOfLines={1} className="max-w-[45%] font-sans-medium">
        {value}
      </Text>
    </View>
  );
}

/**
 * The optional note that goes with an action.
 *
 * One component for all three sheets, because the note means the same thing
 * every time — a line of context in somebody's own words — and three copies of
 * a TextInput drift into three different heights.
 */
function NoteField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.textFaint}
      multiline
      maxLength={280}
      className="rounded-lg bg-glass/[0.08] px-4 py-3 font-sans text-body text-text-primary"
      // Height through `style`, like every other measured box in this app: a
      // `min-h-20` that NativeWind has not compiled yet collapses the field to
      // one line with nothing to say why.
      style={{ minHeight: 88, textAlignVertical: 'top' }}
    />
  );
}
