import type { IncidentCategory, MediaKind } from '@/types/api';
import type { SubmissionDestination } from '@/types/dawuro';

/**
 * What a reporter earns when an organisation licenses their report.
 *
 * Pure integer arithmetic in pesewas. Money never touches a float: cedis as a
 * decimal accumulate rounding error across a payout batch, and a ledger that
 * does not balance is worse than no ledger at all.
 *
 * These rates are placeholders pending a commercial decision. The *structure* is
 * the part worth reviewing — what the platform chooses to pay more for is what
 * reporters will go out and capture.
 */

/**
 * Base rate per category, in pesewas.
 *
 * Deliberately uneven. A report of a fire or a road accident has a short window
 * in which it is worth anything to a responder, and paying the same for it as
 * for a pothole would tell reporters their urgency is worthless.
 */
const BASE_PESEWAS: Record<IncidentCategory, number> = {
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
  wildlife: 1_500,
  other: 1_000,
};

/** Video takes more effort and carries more evidential weight than a still. */
const VIDEO_MULTIPLIER = 1.5;

/**
 * Audio sits between a photograph and a video.
 *
 * Speaking an account takes more of a reporter than pointing a lens, so it
 * pays above a still. It shows less than footage does, so it pays below one.
 * Pricing it like a photo would tell people the safest way to report — from
 * somewhere they are not at risk — is the least valuable, which is the
 * opposite of what this platform should encourage.
 */
const AUDIO_MULTIPLIER = 1.25;

/** A report sent to named organisations only is worth more for being exclusive. */
const DIRECTED_MULTIPLIER = 1.25;

/**
 * A low-confidence fix is still useful, but a dispatcher cannot rely on it, so
 * it earns less rather than being refused outright.
 */
const LOW_CONFIDENCE_MULTIPLIER = 0.7;

/** The platform's share of the licence fee, as a fraction. */
export const PLATFORM_FEE_RATE = 0.3;

export interface CommissionInput {
  category: IncidentCategory;
  destination: SubmissionDestination;
  mediaKind: MediaKind;
  locationConfidence: 'high' | 'low';
  /** Number of organisations licensing it. Each additional one adds half a share. */
  licensedBy?: number;
}

export interface CommissionBreakdown {
  /** What the organisation is charged, before the platform's share. */
  grossPesewas: number;
  platformFeePesewas: number;
  /** What the reporter receives. */
  reporterPesewas: number;
}

/**
 * Estimate what a submission would earn.
 *
 * Used by the review screen to show a figure *before* the reporter commits, and
 * by the ledger afterwards. Same function both times, so the estimate cannot
 * quietly disagree with the payment.
 */
export function estimateCommission(input: CommissionInput): CommissionBreakdown {
  // The public feed pays nothing. Visibility is the reward, and pretending
  // otherwise would set an expectation the model cannot meet.
  if (input.destination === 'public') {
    return { grossPesewas: 0, platformFeePesewas: 0, reporterPesewas: 0 };
  }

  let gross = BASE_PESEWAS[input.category];
  if (input.mediaKind === 'video') gross *= VIDEO_MULTIPLIER;
  if (input.mediaKind === 'audio') gross *= AUDIO_MULTIPLIER;
  if (input.destination === 'directed') gross *= DIRECTED_MULTIPLIER;
  if (input.locationConfidence === 'low') gross *= LOW_CONFIDENCE_MULTIPLIER;

  // Additional licensees add half a share each: the second buyer of the same
  // footage values it less than the first, but the reporter should still gain.
  const licensees = Math.max(1, input.licensedBy ?? 1);
  gross *= 1 + (licensees - 1) * 0.5;

  // Round once, at the end. Rounding each multiplier compounds the error.
  const grossPesewas = Math.round(gross);
  const platformFeePesewas = Math.round(grossPesewas * PLATFORM_FEE_RATE);

  return {
    grossPesewas,
    platformFeePesewas,
    // Subtraction rather than a second rounding, so the three figures always
    // reconcile exactly.
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
