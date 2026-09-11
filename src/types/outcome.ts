/**
 * What happened to a report, told to the person who filed it.
 *
 * The product's promise to a reporter is not "your video was uploaded" — it is
 * "an institution will see this and act." Until now the app could only say the
 * first half. A reporter could watch an upload finish, see a vetting badge, and
 * eventually notice a commission appear, and from none of that learn whether
 * anyone had actually gone to look at the blocked culvert.
 *
 * Every other participant could already see this. The console shows an
 * institution its own queue and its acknowledgement clock, and shows a platform
 * operator every case and every breach. The one person who cannot see it is the
 * one who stood in front of the thing and filmed it.
 *
 * `RESPONSE_META` in `@dawuro/core` already marks every action
 * `notifiesReporter: true`. The intent was recorded; nothing acted on it.
 *
 * These types mirror `logic/response.ts` in the console's shared core. They are
 * duplicated rather than imported because the mobile app does not consume that
 * package — the same hand-sync as `NewsSection`.
 */

/** What an institution did. Mirrors `ResponseAction` in the shared core. */
export type ResponseAction =
  /** Seen by a human. Nothing done yet. */
  | 'acknowledged'
  /** Cannot act without something further from the reporter. */
  | 'more_info_requested'
  /** Someone has gone to look. */
  | 'inspecting'
  /** Passed to a different body, because it is not theirs. */
  | 'referred'
  /** Dealt with. */
  | 'resolved'
  /** Considered and deliberately not acted on. */
  | 'closed_no_action';

export const RESPONSE_ACTIONS: ResponseAction[] = [
  'acknowledged',
  'more_info_requested',
  'inspecting',
  'referred',
  'resolved',
  'closed_no_action',
];

/** Whether the case is finished after this action. */
export const TERMINAL_ACTIONS: ResponseAction[] = ['referred', 'resolved', 'closed_no_action'];

/**
 * An institution the report was routed to.
 *
 * Named, not anonymised. Routing is by an institution's own declared interests,
 * and a reporter who is told "sent to two organisations" learns nothing they
 * can act on or hold anyone to. Naming them is what makes the routing a promise
 * rather than a claim.
 */
export interface ReportRecipient {
  businessId: string;
  businessName: string;
  routedAtIso: string;
}

/** One thing an institution did, in its own name. */
export interface ReportResponse {
  id: string;
  businessId: string;
  businessName: string;
  action: ResponseAction;
  /** What they said. Null when they recorded an action without a note. */
  note: string | null;
  atIso: string;
}

/** The whole story of one report, from the reporter's side. */
export interface ReportOutcome {
  incidentId: string;
  /** Empty for a `public` submission, which is never offered to institutions. */
  recipients: ReportRecipient[];
  /** Oldest first, so the interface can render it as a timeline without sorting. */
  responses: ReportResponse[];
}

/**
 * The one line a reporter should see on the report itself.
 *
 * Deliberately few states. A reporter scanning their own list is asking one
 * question — did anything come of it — and a status vocabulary that needs
 * learning does not answer it.
 */
export type OutcomeStage =
  /** Not offered to anyone: the reporter chose the public feed. */
  | 'public_only'
  /** Sent, and nobody has opened it. The honest majority case. */
  | 'awaiting'
  /** At least one institution has it in hand. */
  | 'in_hand'
  /** Someone finished with it. */
  | 'closed';

/**
 * **The institutional track only.** Not a test for whether a report is public.
 *
 * `public_only` here means no more than "no institution holds this" — which is
 * equally true of a `directed` report the desk has not routed yet, and of any
 * report whose outcome is still loading or failed to load. Reading it as "the
 * reporter chose the public feed" is how the timeline came to tell people their
 * footage had gone to the feed when it had gone nowhere at all.
 *
 * `AuthoredIncident.destination` is the field that answers that question, and
 * the server sends it. Use that.
 */
export function outcomeStage(outcome: ReportOutcome | null): OutcomeStage {
  if (!outcome || outcome.recipients.length === 0) return 'public_only';

  const closed = outcome.responses.some((r) => TERMINAL_ACTIONS.includes(r.action));
  if (closed) return 'closed';

  // Any recorded action means a person has it, including a request for more
  // information — that is contact, and to a reporter it reads as progress.
  return outcome.responses.length > 0 ? 'in_hand' : 'awaiting';
}

/**
 * The most recent action, or null while nobody has touched it.
 *
 * Reads the end of the list rather than sorting by date: `responses` is stored
 * oldest-first, and a second sort would silently disagree with the timeline the
 * reporter is looking at if a timestamp were ever wrong.
 */
export function latestResponse(outcome: ReportOutcome | null): ReportResponse | null {
  if (!outcome || outcome.responses.length === 0) return null;
  return outcome.responses[outcome.responses.length - 1] ?? null;
}

/**
 * Institutions that have it and have not yet said anything.
 *
 * Worth showing separately: "Accra Metropolitan Assembly has not opened this"
 * is a different and more useful fact than "no response", because it names who
 * is silent.
 */
export function silentRecipients(outcome: ReportOutcome | null): ReportRecipient[] {
  if (!outcome) return [];
  const spoken = new Set(outcome.responses.map((r) => r.businessId));
  return outcome.recipients.filter((r) => !spoken.has(r.businessId));
}
