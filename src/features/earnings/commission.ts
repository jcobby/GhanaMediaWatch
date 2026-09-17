import type { IncidentCategory, MediaKind } from '@/types/api';
import type { SubmissionDestination } from '@/types/dawuro';

/**
 * What a reporter earns when an organisation licenses their report.
 *
 * Pure integer arithmetic in pesewas. Money never touches a float: cedis as a
 * decimal accumulate rounding error across a payout batch, and a ledger that
 * does not balance is worse than no ledger at all.
 *
 * **The rates are set, not compiled in.** The platform sets them on the console's
 * Commission rates page and the service serves them at `GET /settings`; an
 * organisation may offer more for reports sent directly to it. The values below
 * are the defaults until those arrive. Hand-synced with the console's
 * `packages/core/src/logic/commission.ts`, which carries the wider category list.
 */

export interface CommissionRates {
  /** Base rate per category, in pesewas, before any multiplier. */
  categoryPesewas: Record<IncidentCategory, number>;
  videoMultiplier: number;
  audioMultiplier: number;
  directedMultiplier: number;
  lowConfidenceMultiplier: number;
  extraLicenseeShare: number;
  platformFeeRate: number;
}

/** The limits every client clamps to, whatever the settings say. */
export const COMMISSION_BOUNDS = {
  categoryPesewas: { min: 0, max: 100_000 },
  multiplier: { min: 0.5, max: 3 },
  lowConfidenceMultiplier: { min: 0.1, max: 1 },
  extraLicenseeShare: { min: 0, max: 1 },
  platformFeeRate: { min: 0, max: 0.9 },
} as const;

export const DEFAULT_COMMISSION_RATES: CommissionRates = {
  /*
   * Deliberately uneven. A report of a fire or a road accident has a short
   * window in which it is worth anything to a responder, and paying the same for
   * it as for a pothole would tell reporters their urgency is worthless.
   */
  categoryPesewas: {
    fire: 2_500,
    accident: 2_500,
    flood: 2_000,
    disorder: 2_000,
    crime: 2_000,
    utility: 1_500,
    infrastructure: 1_200,
    environment: 2_200,
    health: 1_800,
    corruption: 3_000,
    whistleblower: 3_000,
    wildlife: 1_500,
    other: 1_000,
  },
  /** Video takes more effort and carries more evidential weight than a still. */
  videoMultiplier: 1.5,
  /**
   * Audio sits between a photograph and a video. Pricing it like a photo would
   * tell people the safest way to report is the least valuable.
   */
  audioMultiplier: 1.25,
  /** A report sent to named organisations only is worth more for being exclusive. */
  directedMultiplier: 1.25,
  /** A low-confidence fix is still useful, but a dispatcher cannot rely on it. */
  lowConfidenceMultiplier: 0.7,
  extraLicenseeShare: 0.5,
  platformFeeRate: 0.3,
};

/** The default platform share. Surveys use the same share as report commissions. */
export const PLATFORM_FEE_RATE = DEFAULT_COMMISSION_RATES.platformFeeRate;

/** An organisation's higher rates for reports sent directly to it. */
export interface OrganisationOffer {
  categoryPesewas: Partial<Record<IncidentCategory, number>>;
}

export interface CommissionInput {
  category: IncidentCategory;
  destination: SubmissionDestination;
  mediaKind: MediaKind;
  locationConfidence: 'high' | 'low';
  /** Number of organisations licensing it. Each additional one adds a share. */
  licensedBy?: number;
  /** The best offer among the organisations a directed report goes to, in pesewas. */
  offerPesewas?: number | null;
}

export interface CommissionBreakdown {
  /** What the organisation is charged, before the platform's share. */
  grossPesewas: number;
  platformFeePesewas: number;
  /** What the reporter receives. */
  reporterPesewas: number;
}

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function bounded(value: unknown, fallback: number, min: number, max: number, decimals: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(n * factor) / factor));
}

/**
 * Rates from the network, made safe to calculate money with. A missing or
 * malformed value keeps its default rather than becoming zero.
 */
export function sanitiseCommissionRates(raw: unknown): CommissionRates {
  const source: Loose = isRecord(raw) ? raw : {};
  const categories: Loose = isRecord(source.categoryPesewas) ? source.categoryPesewas : {};
  const D = DEFAULT_COMMISSION_RATES;
  const B = COMMISSION_BOUNDS;

  const categoryPesewas = Object.fromEntries(
    (Object.keys(D.categoryPesewas) as IncidentCategory[]).map((category) => [
      category,
      bounded(categories[category], D.categoryPesewas[category], B.categoryPesewas.min, B.categoryPesewas.max, 0),
    ]),
  ) as Record<IncidentCategory, number>;

  return {
    categoryPesewas,
    videoMultiplier: bounded(source.videoMultiplier, D.videoMultiplier, B.multiplier.min, B.multiplier.max, 2),
    audioMultiplier: bounded(source.audioMultiplier, D.audioMultiplier, B.multiplier.min, B.multiplier.max, 2),
    directedMultiplier: bounded(source.directedMultiplier, D.directedMultiplier, B.multiplier.min, B.multiplier.max, 2),
    lowConfidenceMultiplier: bounded(
      source.lowConfidenceMultiplier,
      D.lowConfidenceMultiplier,
      B.lowConfidenceMultiplier.min,
      B.lowConfidenceMultiplier.max,
      2,
    ),
    extraLicenseeShare: bounded(
      source.extraLicenseeShare,
      D.extraLicenseeShare,
      B.extraLicenseeShare.min,
      B.extraLicenseeShare.max,
      2,
    ),
    platformFeeRate: bounded(source.platformFeeRate, D.platformFeeRate, B.platformFeeRate.min, B.platformFeeRate.max, 3),
  };
}

/** An organisation's offer, keeping only rates above the platform's. */
export function sanitiseOffer(raw: unknown, rates: CommissionRates): OrganisationOffer {
  const source: Loose = isRecord(raw) && isRecord(raw.categoryPesewas) ? raw.categoryPesewas : {};
  const categoryPesewas: Partial<Record<IncidentCategory, number>> = {};
  for (const category of Object.keys(rates.categoryPesewas) as IncidentCategory[]) {
    const value = source[category];
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    const pesewas = Math.min(Math.round(n), COMMISSION_BOUNDS.categoryPesewas.max);
    if (pesewas > rates.categoryPesewas[category]) categoryPesewas[category] = pesewas;
  }
  return { categoryPesewas };
}

/** The highest offer for a category among the organisations a report goes to. */
export function bestOffer(
  category: IncidentCategory,
  offers: readonly (OrganisationOffer | null | undefined)[],
): number | null {
  let best: number | null = null;
  for (const offer of offers) {
    const value = offer?.categoryPesewas[category];
    if (typeof value === 'number' && (best === null || value > best)) best = value;
  }
  return best;
}

/**
 * Estimate what a submission would earn.
 *
 * Used by the review screen to show a figure *before* the reporter commits, and
 * by the ledger afterwards. Same function both times, so the estimate cannot
 * quietly disagree with the payment.
 */
export function estimateCommission(
  input: CommissionInput,
  rates: CommissionRates = DEFAULT_COMMISSION_RATES,
): CommissionBreakdown {
  // The public feed pays nothing. Visibility is the reward.
  if (input.destination === 'public') {
    return { grossPesewas: 0, platformFeePesewas: 0, reporterPesewas: 0 };
  }

  const platformBase = rates.categoryPesewas[input.category] ?? rates.categoryPesewas.other;
  // An offer applies only to a report sent directly to the organisation making it.
  const offer = input.destination === 'directed' && input.offerPesewas ? input.offerPesewas : 0;
  let gross = Math.max(platformBase, offer);

  if (input.mediaKind === 'video') gross *= rates.videoMultiplier;
  if (input.mediaKind === 'audio') gross *= rates.audioMultiplier;
  if (input.destination === 'directed') gross *= rates.directedMultiplier;
  if (input.locationConfidence === 'low') gross *= rates.lowConfidenceMultiplier;

  const licensees = Math.max(1, input.licensedBy ?? 1);
  gross *= 1 + (licensees - 1) * rates.extraLicenseeShare;

  // Round once, at the end. Rounding each multiplier compounds the error.
  const grossPesewas = Math.round(gross);
  const platformFeePesewas = Math.round(grossPesewas * rates.platformFeeRate);

  return {
    grossPesewas,
    platformFeePesewas,
    // Subtraction rather than a second rounding, so the three figures reconcile.
    reporterPesewas: grossPesewas - platformFeePesewas,
  };
}

/** Whether a destination earns anything at all. */
export function isEarning(destination: SubmissionDestination): boolean {
  return destination !== 'public';
}

/**
 * Sum a set of entries, in pesewas.
 *
 * Takes amounts rather than entries so it cannot be handed a mixed list of
 * paid and voided rows by accident — the caller has to filter deliberately.
 */
export function sumPesewas(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Progress toward the payout threshold, 0..1. */
export function payoutProgress(pendingPesewas: number, thresholdPesewas: number): number {
  if (thresholdPesewas <= 0) return 1;
  return Math.min(1, Math.max(0, pendingPesewas / thresholdPesewas));
}
