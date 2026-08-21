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
 *                   commission when a business licenses their report
 *   business        agencies, media houses and companies who subscribe to
 *                   receive reports, run surveys, and pay royalties
 *   platform_owner  operators who route submissions, approve businesses, and
 *                   settle payouts. Seeded, never self-registered.
 */

export type AccountType = 'reporter' | 'business' | 'platform_owner';

// ─── where a submission goes ───────────────────────────────────────────────

/**
 * A reporter chooses this at review time, and it changes everything downstream:
 * who sees the report, whether it earns, and who reviews it.
 */
export type SubmissionDestination =
  /** The public feed. No commission — visibility is the reward. */
  | 'public'
  /** Offered to subscribing businesses. Earns a commission if licensed. */
  | 'marketplace'
  /** Sent to named businesses only. Never appears publicly. */
  | 'directed'
  /** Public *and* offered to businesses. */
  | 'both';

export const SUBMISSION_DESTINATIONS: readonly SubmissionDestination[] = [
  'public',
  'marketplace',
  'directed',
  'both',
];

// ─── businesses ────────────────────────────────────────────────────────────

export type BusinessSector =
  'government' | 'media' | 'utility' | 'insurance' | 'ngo' | 'research' | 'other';

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  /** Monthly price in Ghana cedis, minor units (pesewas) to avoid float drift. */
  monthlyPesewas: number;
  /** Reports the subscription includes each month before per-report pricing. */
  includedReports: number;
  /** Cost per report beyond the included allowance, in pesewas. */
  overagePesewas: number;
  seats: number;
  /** Surveys the business may have running at once. 0 disables the feature. */
  concurrentSurveys: number;
  canDirectRequest: boolean;
}

/**
 * Prices are placeholders pending a commercial decision — flagged in
 * API_CONTRACT.md. The *shape* is what matters here: an included allowance plus
 * metered overage is what lets a small district assembly and a national
 * broadcaster share one product.
 */
export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  starter: {
    tier: 'starter',
    monthlyPesewas: 45_000,
    includedReports: 25,
    overagePesewas: 1_500,
    seats: 3,
    concurrentSurveys: 1,
    canDirectRequest: false,
  },
  professional: {
    tier: 'professional',
    monthlyPesewas: 180_000,
    includedReports: 150,
    overagePesewas: 1_000,
    seats: 12,
    concurrentSurveys: 5,
    canDirectRequest: true,
  },
  enterprise: {
    tier: 'enterprise',
    monthlyPesewas: 650_000,
    includedReports: 1_000,
    overagePesewas: 600,
    seats: 50,
    concurrentSurveys: 25,
    canDirectRequest: true,
  },
};

export interface BusinessAccount {
  id: string;
  name: string;
  sector: BusinessSector;
  /** Verified accounts may be credited publicly when they action a report. */
  verified: boolean;
  tier: SubscriptionTier;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'cancelled';
  renewsAtIso: string;
  seatsUsed: number;
  reportsUsedThisPeriod: number;
  /** Categories this business is interested in — drives routing suggestions. */
  interests: IncidentCategory[];
  logoUrl: string | null;
}

// ─── earnings ──────────────────────────────────────────────────────────────

export type CommissionStatus =
  /** Submitted; no business has licensed it yet. */
  | 'pending'
  /** A business licensed the report. Amount is fixed at this point. */
  | 'earned'
  /** Included in a payout batch. */
  | 'paid'
  /** Report rejected or withdrawn — nothing owed. */
  | 'void';

export interface CommissionEntry {
  id: string;
  incidentId: string;
  /** Short label of the report, so the ledger reads without a second lookup. */
  incidentSummary: string;
  category: IncidentCategory;
  /** Null while pending — no business has licensed it. */
  businessName: string | null;
  status: CommissionStatus;
  /** Pesewas. Integer arithmetic only; money never touches a float. */
  amountPesewas: number;
  createdAtIso: string;
  paidAtIso: string | null;
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
 * Reports do not reach businesses automatically. An operator decides which
 * businesses a marketplace submission is offered to — that judgement is the
 * platform's actual product, and it is what a subscription buys.
 */
export interface RoutingItem {
  id: string;
  incidentId: string;
  summary: string;
  category: IncidentCategory;
  destination: SubmissionDestination;
  /** Businesses the reporter named, on a directed submission. */
  requestedBusinessIds: string[];
  /** Businesses the platform suggests, from sector and interest matching. */
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
