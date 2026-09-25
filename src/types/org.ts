import type { Incident } from './api';
import type { NewsSection } from './sections';
import type { SubscriptionTier } from './dawuro';

/**
 * The organisation side of the phone.
 *
 * An organisation account is not a reporter with extra buttons. It never films
 * anything: reports arrive already filmed, routed to it by the platform, and
 * what the account does is decide about them — license, respond, dispatch
 * somebody, ask an editor to publish.
 *
 * Every shape here was read out of `/v1/openapi.json` on 18 September rather
 * than inferred from the console's types. Where the document declares a bare
 * `string` the union is narrowed at the boundary and an unrecognised value is
 * dropped, because these drive icons, colours and words — a status nobody here
 * can put into words is worse rendered raw than not rendered.
 */

/**
 * What the organisation has decided about a report, internally.
 *
 * `POST /org/incidents/{id}/status`. Its own record, not visible to the
 * reporter — `OrgResponseAction` is the one the reporter sees.
 */
export type OrgIncidentStatus = 'in_review' | 'actioned' | 'dismissed';

export const ORG_INCIDENT_STATUSES: readonly OrgIncidentStatus[] = [
  'in_review',
  'actioned',
  'dismissed',
];

/**
 * What the organisation tells the person who filed the report.
 *
 * `POST /org/incidents/{id}/response`, and the single most valuable thing this
 * screen can do. A citizen who films a burst main and hears nothing has no
 * reason to film the next one; the reporter's outcome timeline is built from
 * exactly these, and until now nothing on a phone could send one.
 */
export type OrgResponseAction =
  | 'acknowledged'
  | 'more_info_requested'
  | 'inspecting'
  | 'referred'
  | 'resolved'
  | 'closed_no_action';

export const ORG_RESPONSE_ACTIONS: readonly OrgResponseAction[] = [
  'acknowledged',
  'inspecting',
  'more_info_requested',
  'referred',
  'resolved',
  'closed_no_action',
];

/**
 * Where a dispatched person has got to.
 *
 * The service's own words, and its own ordering: new assignments start at
 * `assigned`, and `PATCH` may move between the rest. Reopening a closed
 * assignment is allowed, so this is not a one-way ladder and the screen must
 * not present it as one.
 */
export type AssignmentStatus = 'assigned' | 'accepted' | 'en_route' | 'on_scene' | 'closed';

export const ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  'assigned',
  'accepted',
  'en_route',
  'on_scene',
  'closed',
];

export type OrgMemberRole = 'owner' | 'admin' | 'analyst' | 'dispatcher' | 'viewer';

/**
 * A report routed to this organisation.
 *
 * `GET /org/inbox` returns the ordinary incident projection **plus `licensed`
 * and `licensedAt`**. Those two are the whole reason a licences screen can
 * exist on the phone at all: until the service added them there was no way for
 * any client to list what an organisation had paid for, and the web console
 * kept the licensed set in browser memory — reload and it was gone.
 *
 * The OpenAPI document still declares this route's 200 as a plain
 * `PublicIncidentPage`; the two fields are named only in its description. So
 * they are read defensively: `licensed` false and `licensedAt` null is how an
 * older service answers, and that reads as "not licensed", which is the safe
 * direction to be wrong in — it offers the licence again rather than claiming
 * one that was never bought.
 */
export interface OrgInboxItem extends Incident {
  licensed: boolean;
  /** ISO timestamp of the licence, when the service dates it. */
  licensedAt: string | null;
}

/**
 * The plan, as the organisation's own token can see it.
 *
 * `GET /org/subscription`. `tier` and `status` arrive as bare strings and are
 * narrowed here; an unrecognised tier is null rather than guessed, because the
 * tier is what prices a download and a wrong guess quotes somebody the wrong
 * money.
 */
export interface OrgSubscriptionDetail {
  tier: SubscriptionTier | null;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | null;
  renewsAtIso: string | null;
  seatsUsed: number;
  /** Billable licences taken in the current billing period. */
  reportsUsedThisPeriod: number;
}

/** `GET /org/dashboard` — the three counts and the plan behind them. */
export interface OrgDashboard {
  inboxCount: number;
  publishedCount: number;
  openAssignments: number;
  subscription: OrgSubscriptionDetail | null;
}

/** `GET /org/members` — who can be dispatched, and who may spend money. */
export interface OrgMember {
  userId: string;
  role: OrgMemberRole | null;
  email: string;
  displayName: string;
}

/** `GET /org/assignments` — one person sent to one report. */
export interface OrgAssignment {
  id: string;
  incidentId: string;
  assigneeId: string;
  /** The service's own label for the assignee; may be blank. */
  employeeName: string;
  status: AssignmentStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What licensing one report actually cost, and what the reporter got.
 *
 * Returned by `POST /org/incidents/{id}/license`. Shown back in full rather
 * than reduced to "done": an organisation spending money on somebody's footage
 * should see the split, and the reporter's share is the number that makes the
 * platform's claim about paying citizens checkable rather than a promise.
 */
export interface LicenceResult {
  incidentId: string;
  licensed: boolean;
  grossPesewas: number;
  platformFeePesewas: number;
  reporterPesewas: number;
  /** What this licence adds to the invoice. Zero on an unlimited plan. */
  downloadChargePesewas: number;
}

/** `POST /org/incidents/{id}/publish` — asking an editor to run it. */
export interface PublicationRequest {
  /** Required. The service rejects a publish with no desk and invents none. */
  section: NewsSection;
  note?: string;
}
