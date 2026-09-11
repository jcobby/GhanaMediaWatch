import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import {
  latestResponse,
  outcomeStage,
  silentRecipients,
  type OutcomeStage,
  type ReportOutcome,
  type ResponseAction,
} from '@/types/outcome';
import type { VettingState } from '@/types/api';
import type { SubmissionDestination } from '@/types/dawuro';

/**
 * What happened to a report, as a timeline.
 *
 * Read top to bottom: filed, sent to these institutions, and then whatever any
 * of them did. Chronological rather than grouped by organisation, because a
 * reporter is asking "what has happened" and not "who did what" — and because
 * a single-entry list grouped by organisation reads as a database view.
 *
 * The silence case is given the same weight as the rest. An institution that
 * has had a report for eleven hours and not opened it is the most common thing
 * that happens, and it is a fact the reporter is entitled to. Rendering it as
 * an empty state, or leaving it out, would make the app look broken at exactly
 * the moment it is working correctly.
 */

const ACTION_ICON: Record<ResponseAction, keyof typeof Ionicons.glyphMap> = {
  acknowledged: 'eye-outline',
  more_info_requested: 'help-circle-outline',
  inspecting: 'walk-outline',
  referred: 'arrow-redo-outline',
  resolved: 'checkmark-circle',
  closed_no_action: 'remove-circle-outline',
};

/** Semantic, not decorative: green only where something was actually done. */
function actionHue(action: ResponseAction, c: ReturnType<typeof useColors>): string {
  switch (action) {
    case 'resolved':
      return c.success;
    case 'more_info_requested':
      return c.warning;
    case 'referred':
      return c.accent;
    case 'closed_no_action':
      return c.textMuted;
    default:
      return c.info;
  }
}

export function stageTone(stage: OutcomeStage): 'neutral' | 'accent' | 'success' | 'warning' {
  switch (stage) {
    case 'closed':
      return 'success';
    case 'in_hand':
      return 'accent';
    case 'awaiting':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * The editorial half of the story.
 *
 * A report the reporter sent to the public feed does **not** go straight there.
 * It lands on the editorial desk, and an editor or the platform owner decides
 * whether it runs and on which desk — the backend publishes a report only on a
 * transition from that desk, and only when the destination is `public` or
 * `both`.
 *
 * The timeline said none of this. It ended at "Public feed — you sent this to
 * the public feed, so it was not routed to any organisation", which is a
 * terminal-sounding sentence about a report that had not gone anywhere yet, and
 * it sat directly beneath a badge reading "In review". A reporter checking on
 * their own footage was told, in the same panel, that it was still being looked
 * at and that nothing further was going to happen to it.
 */
const EDITORIAL: Record<VettingState, { icon: keyof typeof Ionicons.glyphMap; key: string }> = {
  pending_review: { icon: 'newspaper-outline', key: 'review' },
  published: { icon: 'globe-outline', key: 'published' },
  rejected: { icon: 'close-circle-outline', key: 'rejected' },
  restricted: { icon: 'lock-closed-outline', key: 'restricted' },
};

/**
 * The step for a vetting state, including one this build has never heard of.
 *
 * `EDITORIAL[vettingState].icon` is a `Record` lookup keyed on a value the
 * *service* chose. A state added server-side before this build ships makes that
 * `undefined.icon` — and the console's version of exactly this took a whole
 * route down with *Cannot read properties of undefined*.
 *
 * A reporter checking on their own footage must not be shown a broken screen
 * because the desk has a state the app has not learned yet. `review` is the
 * honest fallback: something is happening to it and nobody here can say what.
 */
function editorialStep(state: VettingState): { icon: keyof typeof Ionicons.glyphMap; key: string } {
  return EDITORIAL[state] ?? EDITORIAL.pending_review;
}

function editorialHue(state: VettingState, c: ReturnType<typeof useColors>): string {
  switch (state) {
    case 'published':
      return c.success;
    case 'rejected':
      return c.danger;
    case 'restricted':
      return c.textMuted;
    default:
      return c.warning;
  }
}

export function ReportOutcomeTimeline({
  outcome,
  filedAtIso,
  destination,
  vettingState,
  publishedAtIso,
}: {
  outcome: ReportOutcome | null;
  filedAtIso: string | null;
  /** What the reporter asked for. Decides which halves of this apply. */
  destination: SubmissionDestination;
  vettingState: VettingState;
  publishedAtIso: string | null;
}) {
  const c = useColors();
  const { t } = useTranslation();

  const silent = silentRecipients(outcome);

  /*
   * **Every report is read by an editor. There is no exception.**
   *
   * Including one addressed to named institutions: the destination says who may
   * receive it, never whether it is reviewed. And the home feed is the editor's
   * alone — nothing reaches Latest or Ghana except by an editor putting it
   * there, on a desk they choose.
   *
   * This was briefly gated on `destination === 'public' || 'both'`, which
   * dropped the review step off every directed and marketplace report and told
   * those reporters their footage went straight from their phone to an
   * organisation. It is unconditional now, and stays unconditional.
   */
  const institutional = destination !== 'public';

  const recipients = outcome?.recipients ?? [];
  const responses = outcome?.responses ?? [];
  /*
   * Nothing has been routed *yet*, as distinct from nothing will be.
   *
   * An empty recipients list used to be read as "the reporter chose the public
   * feed" — which is also what a directed report looks like before the desk has
   * routed it, and what any report looks like while its outcome is still
   * loading or has failed to load.
   */
  const awaitingRouting = institutional && recipients.length === 0;

  return (
    <View className="gap-0">
      <Step
        icon="cloud-upload-outline"
        hue={c.textMuted}
        title={t('outcome.filed')}
        when={filedAtIso ?? undefined}
        first
      />

      <Step
        icon={editorialStep(vettingState).icon}
        hue={editorialHue(vettingState, c)}
        title={t(`outcome.editorial.${editorialStep(vettingState).key}.title`)}
        body={t(
          `outcome.editorial.${editorialStep(vettingState).key}.${
            // The "and nobody else gets it" half is only true of `public`.
            // On any other destination the report is offered to institutions as
            // well, and saying otherwise there would be the same lie reversed.
            destination === 'public' ? 'bodyPublic' : 'body'
          }`,
        )}
        when={vettingState === 'published' ? (publishedAtIso ?? undefined) : undefined}
        last={!institutional}
      />

      {awaitingRouting ? (
        <Step
          icon="time-outline"
          hue={c.textMuted}
          title={t('outcome.notRoutedYetTitle')}
          body={t('outcome.notRoutedYetBody')}
          last
        />
      ) : null}

      {recipients.length > 0 ? (
        <Step
          icon="send-outline"
          hue={c.accent}
          title={
            recipients.length === 1
              ? t('outcome.routedOne', { name: recipients[0]!.businessName })
              : t('outcome.routedMany', {
                  name: recipients[0]!.businessName,
                  count: recipients.length - 1,
                })
          }
          when={recipients[0]!.routedAtIso}
          last={responses.length === 0 && silent.length === 0}
        />
      ) : null}

      {responses.map((response, i) => (
        <Step
          key={response.id}
          icon={ACTION_ICON[response.action] ?? 'ellipse-outline'}
          hue={actionHue(response.action, c)}
          title={`${t(`outcome.action.${response.action}`)} — ${response.businessName}`}
          body={response.note ?? undefined}
          when={response.atIso}
          last={i === responses.length - 1 && silent.length === 0}
        />
      ))}

      {/*
        Named silence.

        "No response yet" tells a reporter nothing they can use. Naming the
        organisation that is holding it turns the same fact into something they
        can chase, quote, or take to somebody else.
      */}
      {silent.length > 0 ? (
        <Step
          icon="time-outline"
          hue={c.warning}
          title={t('outcome.awaitingTitle')}
          body={
            silent.length === 1
              ? t('outcome.awaitingBody', { name: silent[0]!.businessName })
              : t('outcome.awaitingBodyMany', { count: silent.length })
          }
          last
        />
      ) : null}
    </View>
  );
}

function Step({
  icon,
  hue,
  title,
  body,
  when,
  first = false,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  hue: string;
  title: string;
  body?: string;
  when?: string;
  first?: boolean;
  last?: boolean;
}) {
  const c = useColors();

  return (
    <View className="flex-row gap-3">
      {/* The rail: a dot per step, joined by a line except at the ends. */}
      <View className="items-center" style={{ width: 24 }}>
        <View
          style={{
            width: 2,
            height: 8,
            backgroundColor: first ? 'transparent' : c.hairline + '22',
          }}
        />
        <View
          className="items-center justify-center rounded-pill"
          style={{ width: 24, height: 24, backgroundColor: hue + '22' }}
        >
          <Ionicons name={icon} size={13} color={hue} />
        </View>
        <View
          style={{
            width: 2,
            flex: 1,
            backgroundColor: last ? 'transparent' : c.hairline + '22',
          }}
        />
      </View>

      <View className="flex-1 pb-4 pt-1.5">
        <Text variant="body-sm" className="font-sans-semibold">
          {title}
        </Text>
        {body ? (
          <Text variant="caption" tone="muted" className="mt-0.5" style={{ lineHeight: 18 }}>
            {body}
          </Text>
        ) : null}
        {when ? (
          <Text variant="caption" tone="faint" className="mt-1">
            {formatRelativeTime(when)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The one line that belongs on the report card itself. */
export function outcomeSummary(
  outcome: ReportOutcome | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const stage = outcomeStage(outcome);
  const latest = latestResponse(outcome);

  /*
   * Not the stage label — the badge beside this already carries that.
   *
   * Returning it here printed "Public feed  Public feed" on every unrouted
   * report: two elements, same string, no information in the second. A summary
   * sitting next to a badge has to say what the badge does not.
   */
  if (stage === 'public_only') return t('outcome.notRouted');
  if (stage === 'awaiting') {
    const silent = silentRecipients(outcome);
    return silent.length === 1
      ? t('outcome.awaitingBody', { name: silent[0]!.businessName })
      : t('outcome.awaitingBodyMany', { count: silent.length });
  }
  // Closed or in hand: the most recent thing that happened is the answer.
  return latest ? `${t(`outcome.action.${latest.action}`)} — ${latest.businessName}` : '';
}
