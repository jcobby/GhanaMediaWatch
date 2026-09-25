import type { IncidentCategory } from './api';

/**
 * The Dawuro platform model.
 *
 * "Dawuro" is the gong-gong — the town crier's bell used across Ghana to
 * summon people and announce news. The public rings it; institutions listen.
 *
 * Three parties, and the whole design follows from keeping them distinct:
 *
 *   reporter        members of the public who capture and submit, and earn a
 *                   commission when an organisation licenses their report
 *   organisation        agencies, media houses and companies who subscribe to
 *                   receive reports, run surveys, and pay royalties
 *   platform_owner  operators who route submissions, approve organisations, and
 *                   settle payouts. Seeded, never self-registered.
 */

/**
 * What kind of account this is.
 *
 * `organisation` was `business`, and is renamed with the rest of the
 * vocabulary — the party it names is a district assembly or NADMO as often as
 * it is a company, and the interface calls it an organisation everywhere else.
 *
 * Derived on the client rather than read from the wire (`authStore` sets it
 * from whether the caller has an `orgId`), so the rename crosses no contract.
 * It *is* written to the keychain, which is why `hydrate` accepts the old
 * spelling — see `migrateProfile`.
 */
export type AccountType = 'reporter' | 'organisation' | 'platform_owner';

// ─── where a submission goes ───────────────────────────────────────────────

/**
 * A reporter chooses this at review time, and it changes everything downstream:
 * who sees the report, whether it earns, and who reviews it.
 */
export type SubmissionDestination =
  /** The public feed. No commission — visibility is the reward. */
  | 'public'
  /** Offered to subscribing organisations. Earns a commission if licensed. */
  | 'marketplace'
  /** Sent to named organisations only. Never appears publicly. */
  | 'directed'
  /** Public *and* offered to organisations. */
  | 'both';

export const SUBMISSION_DESTINATIONS: readonly SubmissionDestination[] = [
  'public',
  'marketplace',
  'directed',
  'both',
];

// ─── organisations ────────────────────────────────────────────────────────────

export type OrganisationSector =
  'government' | 'media' | 'utility' | 'insurance' | 'ngo' | 'research' | 'other';

/**
 * Enumerated so registration can offer them, `other` last.
 *
 * It is the service's default for an omitted sector, and it is the answer
 * somebody picks when none of the others fit — both of which put it at the end
 * rather than in the middle of the list.
 */
export const ORGANISATION_SECTORS: readonly OrganisationSector[] = [
  'government',
  'media',
  'utility',
  'insurance',
  'ngo',
  'research',
  'other',
];

export type SubscriptionTier = 'basic' | 'standard' | 'enterprise';

export type BillingPeriod = 'monthly' | 'annual';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  /** How often the recurring fee falls due. */
  billingPeriod: BillingPeriod;
  /** The recurring fee for one billing period, in pesewas. */
  feePesewas: number;
  /**
   * Charge per downloaded report, in pesewas.
   *
   * `null` means unlimited — downloads cost nothing beyond the recurring fee.
   * Deliberately null rather than 0: a zero price and an uncapped plan are
   * different things, and a nullable field forces every caller to decide which
   * one it is handling.
   */
  perDownloadPesewas: number | null;
  seats: number;
  /** Surveys the organisation may have running at once. 0 disables the feature. */
  concurrentSurveys: number;
  canDirectRequest: boolean;
}

/**
 * MUST stay identical to packages/core in the console repo.
 *
 * The two products quote the same prices to different people — a reporter sees
 * what a download earns them, an organisation sees what it costs. If these
 * drift, the app and the invoice disagree, and the person who notices is a
 * customer. Until the shared package is published, this file is the copy and
 * core is the original.
 */
export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  basic: {
    tier: 'basic',
    billingPeriod: 'monthly',
    feePesewas: 45_000,
    perDownloadPesewas: 2_000,
    seats: 3,
    concurrentSurveys: 1,
    canDirectRequest: false,
  },
  standard: {
    tier: 'standard',
    billingPeriod: 'monthly',
    feePesewas: 180_000,
    perDownloadPesewas: 1_200,
    seats: 12,
    concurrentSurveys: 5,
    canDirectRequest: true,
  },
  enterprise: {
    tier: 'enterprise',
    billingPeriod: 'annual',
    feePesewas: 2_400_000,
    perDownloadPesewas: null,
    seats: 50,
    concurrentSurveys: 25,
    canDirectRequest: true,
  },
};

/** True when downloads carry no per-item charge. */
export function isUnlimited(plan: SubscriptionPlan): boolean {
  return plan.perDownloadPesewas === null;
}

/** What one more download costs on this plan. Zero on an unlimited plan. */
export function downloadCharge(plan: SubscriptionPlan): number {
  return plan.perDownloadPesewas ?? 0;
}

/** Cost of a year on this plan, for comparing a monthly tier with an annual one. */
export function annualCost(plan: SubscriptionPlan, downloadsPerYear: number): number {
  const taken = Math.max(0, Math.floor(downloadsPerYear));
  const periods = plan.billingPeriod === 'annual' ? 1 : 12;
  return plan.feePesewas * periods + downloadCharge(plan) * taken;
}

export interface OrganisationAccount {
  id: string;
  name: string;
  sector: OrganisationSector;
  /** Verified accounts may be credited publicly when they action a report. */
  verified: boolean;
  tier: SubscriptionTier;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'cancelled';
  renewsAtIso: string;
  seatsUsed: number;
  /** Billable downloads taken in the current period. */
  reportsUsedThisPeriod: number;
  /** Categories this organisation is interested in — drives routing suggestions. */
  interests: IncidentCategory[];
  logoUrl: string | null;
}

/**
 * One organisation as the public directory describes it.
 *
 * `GET /organisations` is the only organisation endpoint a reporter can call,
 * and it returns exactly this — verified against the live service:
 *
 *     {"id":"org_4dfe…","name":"BBC World News","sector":"government",
 *      "verified":true,"logoUrl":null,"publishedCount":0,"openSurveyCount":0}
 *
 * Billing state, tier, seats and declared interests are the organisation's own
 * organisation and reach only callers inside it. This was typed as a full
 * `OrganisationAccount`, so all of those were silently `undefined` on every
 * directory row — and `receiving()` filtered the list on
 * `subscriptionStatus === 'active'`, dropped every organisation, and told
 * reporters "No buyers yet" permanently. Two active newsrooms were in the
 * directory while the badge still showed.
 *
 * A separate type rather than optional fields on the shared one: every screen
 * that reads a real organisation record — billing, inbox, routing desk — would
 * otherwise have to defend against absences that cannot occur there.
 */
export interface DirectoryOrganisation {
  id: string;
  name: string;
  sector: OrganisationSector;
  /** The platform's own word that this organisation is real and approved. */
  verified: boolean;
  logoUrl: string | null;
  /** Reports published under this organisation's name. */
  publishedCount?: number;
  openSurveyCount?: number;
  /**
   * Higher commission rates this organisation offers for reports sent directly
   * to it, in pesewas per category.
   *
   * Served on the public directory since 17 September. Still optional, because
   * most organisations set no offer and the field is then absent rather than
   * empty — `sanitiseOffer` treats both the same way, and an offer can only ever
   * raise what a reporter earns, never lower it below the platform rate.
   */
  commissionOffer?: { categoryPesewas?: Record<string, number> } | null;
}

// ─── earnings ──────────────────────────────────────────────────────────────

export type CommissionStatus =
  /** Submitted; no organisation has licensed it yet. */
  | 'pending'
  /** An organisation licensed the report. Amount is fixed at this point. */
  | 'earned'
  /** Included in a payout batch. */
  | 'paid'
  /** Report rejected or withdrawn — nothing owed. */
  | 'void';

/**
 * Where the money itself has got to, as distinct from whether it is owed.
 *
 * `status` says the commission was earned; this says whether it has actually
 * reached a phone. A reporter who has been paid and a reporter whose payment is
 * sitting on hold because they never saved a payout number both read "Earned"
 * without it, and the second one has something to do about it.
 */
export type PayoutStatus = 'held' | 'pending' | 'sent' | 'failed' | 'paid';

/**
 * The values this app knows how to explain.
 *
 * Used to check what the service sent before it reaches a wallet screen. A
 * status nobody here can put into words is dropped rather than printed raw —
 * `partially_settled` on a row of somebody's earnings is worse than no badge.
 */
export const PAYOUT_STATUSES: readonly PayoutStatus[] = [
  'held',
  'pending',
  'sent',
  'failed',
  'paid',
];

export interface CommissionEntry {
  id: string;
  incidentId: string;
  /** Short label of the report, so the ledger reads without a second lookup. */
  incidentSummary: string;
  category: IncidentCategory;
  /** Null while pending — no organisation has licensed it. */
  businessName: string | null;
  status: CommissionStatus;
  /** Pesewas. Integer arithmetic only; money never touches a float. */
  amountPesewas: number;
  createdAtIso: string;
  paidAtIso: string | null;
  /** Null until the commission has been put into a payout batch. */
  payoutStatus: PayoutStatus | null;
  /** Why it is held or why it failed, in the service's words. */
  heldReason: string | null;
}

export interface EarningsSummary {
  /** Licensed but not yet paid out. */
  pendingPesewas: number;
  /** Settled to the reporter. */
  paidPesewas: number;
  lifetimePesewas: number;
  reportsLicensed: number;
  /** Payouts run once a reporter clears this floor. */
  payoutThresholdPesewas: number;
  nextPayoutIso: string | null;
}

// ─── surveys ───────────────────────────────────────────────────────────────

export type SurveyQuestionKind = 'single_choice' | 'multi_choice' | 'scale' | 'text' | 'photo';

export interface SurveyQuestion {
  id: string;
  kind: SurveyQuestionKind;
  prompt: string;
  /** Present for choice questions. */
  options?: string[];
  required: boolean;
}

export interface Survey {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  /** Pesewas paid to each reporter who completes it. */
  rewardPesewas: number;
  /** Null means anywhere in the country. */
  targetArea: { latitude: number; longitude: number; radiusM: number } | null;
  responsesTarget: number;
  responsesReceived: number;
  closesAtIso: string;
  status: 'draft' | 'live' | 'closed';
}

// ─── platform routing ──────────────────────────────────────────────────────

/**
 * A submission waiting on the platform owner to route it.
 *
 * Reports do not reach organisations automatically. An operator decides which
 * organisations a marketplace submission is offered to — that judgement is the
 * platform's actual product, and it is what a subscription buys.
 */
export interface RoutingItem {
  id: string;
  incidentId: string;
  summary: string;
  category: IncidentCategory;
  destination: SubmissionDestination;
  /** Organisations the reporter named, on a directed submission. */
  requestedBusinessIds: string[];
  /** Organisations the platform suggests, from sector and interest matching. */
  suggestedBusinessIds: string[];
  reporterHandle: string;
  submittedAtIso: string;
  status: 'awaiting_routing' | 'routed' | 'rejected';
  locationLabel: string | null;
  thumbnailUrl: string;
}

// ─── money formatting ──────────────────────────────────────────────────────

/**
 * Format pesewas as cedis.
 *
 * Integer minor units throughout: floating-point cedis accumulate rounding
 * error across a payout batch, and a ledger that does not balance is worse than
 * no ledger at all.
 */
export function formatCedis(pesewas: number, options: { compact?: boolean } = {}): string {
  const cedis = pesewas / 100;
  if (options.compact && cedis >= 1000) {
    return `GH₵${(cedis / 1000).toFixed(1)}k`;
  }
  return `GH₵${cedis.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
