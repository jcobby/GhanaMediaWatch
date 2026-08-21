import type { IncidentCategory } from '@/types/api';
import type { BusinessAccount, SubmissionDestination } from '@/types/dawuro';

/**
 * Automatic routing — which businesses receive a submission.
 *
 * Reports reach businesses on their own. A reporter picks a category and,
 * optionally, names organisations; everything else is matching. Requiring a
 * human to touch every submission does not survive contact with volume — a few
 * hundred reports a day would put the whole platform behind one desk.
 *
 * The platform operator's desk sits *above* this: they see every submission and
 * what it was auto-routed to, and can add or remove recipients. Oversight and
 * override, not a gate.
 *
 * Pure and testable — routing decides who gets paid and who gets the footage,
 * which is not logic to leave unverified.
 */

export interface RoutableSubmission {
  category: IncidentCategory;
  destination: SubmissionDestination;
  /** Businesses the reporter named explicitly. */
  requestedBusinessIds: string[];
  /** Null when the reporter suppressed the location. */
  location: { latitude: number; longitude: number } | null;
}

/** A business's standing interest in a geographic area. */
export interface BusinessWatchArea {
  businessId: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export interface RouteMatch {
  businessId: string;
  /** Higher is a better fit. Drives the order an operator reviews them in. */
  score: number;
  reasons: RouteReason[];
}

export type RouteReason =
  /** The reporter named this business explicitly. */
  | 'requested'
  /** The category is in the business's declared interests. */
  | 'interest_match'
  /** The report falls inside a watch area this business defined. */
  | 'in_watch_area'
  /** The business has allowance left this period. */
  | 'has_allowance';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A business can only receive reports while its subscription is live. */
export function canReceive(business: BusinessAccount): boolean {
  return business.subscriptionStatus === 'active' || business.subscriptionStatus === 'trialing';
}

/**
 * Match a submission to businesses.
 *
 * Returns an ordered list, best fit first. An empty result is a legitimate
 * outcome — a report nobody has declared an interest in should surface on the
 * operator's desk rather than being forced onto an arbitrary recipient.
 */
export function autoRoute(
  submission: RoutableSubmission,
  businesses: readonly BusinessAccount[],
  watchAreas: readonly BusinessWatchArea[] = [],
): RouteMatch[] {
  // A public-only report is never offered to businesses. Routing it would
  // quietly turn a free contribution into a commercial one.
  if (submission.destination === 'public') return [];

  const matches: RouteMatch[] = [];

  for (const business of businesses) {
    if (!canReceive(business)) continue;

    const reasons: RouteReason[] = [];
    let score = 0;

    const requested = submission.requestedBusinessIds.includes(business.id);
    if (requested) {
      reasons.push('requested');
      // An explicit request outranks every heuristic. The reporter was there.
      score += 100;
    }

    if (business.interests.includes(submission.category)) {
      reasons.push('interest_match');
      score += 40;
    }

    // Geography only applies when the reporter published a location. A
    // suppressed location must not silently exclude a business — it means we
    // cannot tell, not that the answer is no.
    if (submission.location) {
      const areas = watchAreas.filter((a) => a.businessId === business.id);
      const inside = areas.some(
        (area) => distanceMetres(submission.location!, area) <= area.radiusM,
      );
      if (inside) {
        reasons.push('in_watch_area');
        score += 30;
      } else if (areas.length > 0 && !requested) {
        // They drew a boundary and this falls outside it. Respect it.
        continue;
      }
    }

    // A business over its allowance still matches, but ranks lower — it will
    // pay overage, so it should not outrank someone with headroom.
    const plan = business.reportsUsedThisPeriod;
    if (plan < 1_000) {
      reasons.push('has_allowance');
      score += 10;
    }

    /*
     * A directed submission goes only to the named businesses. Everything else
     * needs a positive reason — matching on "has allowance" alone would send a
     * wildlife report to an insurer purely because they had budget left.
     */
    if (submission.destination === 'directed' && !requested) continue;
    if (!requested && !reasons.includes('interest_match') && !reasons.includes('in_watch_area')) {
      continue;
    }

    matches.push({ businessId: business.id, score, reasons });
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Whether a submission needs an operator to look at it.
 *
 * Auto-routing handles the ordinary case; these are the ones worth a human.
 */
export function needsReview(submission: RoutableSubmission, matches: RouteMatch[]): boolean {
  // Nobody wanted it — an operator may know a recipient the rules do not.
  if (matches.length === 0) return true;
  // The reporter named someone who did not match; worth confirming the intent.
  const matched = new Set(matches.map((m) => m.businessId));
  return submission.requestedBusinessIds.some((id) => !matched.has(id));
}
