import {
  GPS_ABSOLUTE_MAX_ACCURACY_M,
  GPS_ACCURACY_THRESHOLD_M,
  GPS_STALL_TIMEOUT_MS,
} from '@/lib/constants';

/**
 * The GPS gate — the rule that decides whether the camera may mount.
 *
 * Pure and free of platform imports so every branch is unit-testable without
 * standing outside with a phone. The hook around it supplies real readings;
 * this decides what they mean.
 *
 * The gate is the product's defining constraint: a report without a trustworthy
 * coordinate cannot be dispatched to, so the camera stays locked until the fix
 * is good enough — or until the reporter knowingly accepts a worse one.
 */

export type LocationConfidence = 'high' | 'low';

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  /** Android can report a fix injected by a mock-location app. */
  isMocked: boolean;
  /** Device clock at the moment of the reading. */
  timestamp: number;
}

export type GateStatus =
  /** Permission was refused; only the OS settings screen can change this. */
  | { kind: 'permission_denied' }
  /** Location services are off device-wide. */
  | { kind: 'services_disabled' }
  /** Waiting for a fix, or for the fix to tighten. */
  | { kind: 'acquiring'; accuracyM: number | null; elapsedMs: number }
  /** Accuracy has not converged in time — offer coaching and the escape hatch. */
  | { kind: 'stalled'; accuracyM: number | null; elapsedMs: number }
  /** Camera may mount. */
  | { kind: 'ready'; fix: LocationFix; confidence: LocationConfidence };

export interface GateInput {
  permissionGranted: boolean;
  servicesEnabled: boolean;
  fix: LocationFix | null;
  /** Milliseconds since the gate started watching. */
  elapsedMs: number;
  /** Set once the reporter accepts a worse fix via the escape hatch. */
  reducedAccuracyAccepted: boolean;
}

/**
 * Decide the gate's current state.
 *
 * Order matters: permission and services are checked before accuracy, because
 * showing "move to an open area" to someone who never granted permission sends
 * them outside to stare at a phone that was never going to work.
 */
export function evaluateGate(input: GateInput): GateStatus {
  if (!input.permissionGranted) return { kind: 'permission_denied' };
  if (!input.servicesEnabled) return { kind: 'services_disabled' };

  const { fix, elapsedMs } = input;
  const accuracyM = fix?.accuracyM ?? null;

  if (fix && fix.accuracyM <= GPS_ACCURACY_THRESHOLD_M) {
    return { kind: 'ready', fix, confidence: 'high' };
  }

  // The escape hatch. Deliberately capped: beyond the absolute maximum the
  // coordinate is not a location at all, and letting it through would put a
  // meaningless pin on a dispatcher's map.
  if (input.reducedAccuracyAccepted && fix && fix.accuracyM <= GPS_ABSOLUTE_MAX_ACCURACY_M) {
    return { kind: 'ready', fix, confidence: 'low' };
  }

  if (elapsedMs >= GPS_STALL_TIMEOUT_MS) {
    return { kind: 'stalled', accuracyM, elapsedMs };
  }

  return { kind: 'acquiring', accuracyM, elapsedMs };
}

/** True when the camera preview is allowed to mount. */
export function isCameraUnlocked(status: GateStatus): boolean {
  return status.kind === 'ready';
}

/**
 * Whether to offer "proceed with reduced accuracy".
 *
 * Only once stalled, and only when there is a usable-if-imprecise fix to
 * proceed *with* — offering it while no fix exists at all produces a report
 * with no coordinate, which is exactly what the gate exists to prevent.
 */
export function canOfferReducedAccuracy(status: GateStatus, fix: LocationFix | null): boolean {
  return status.kind === 'stalled' && fix !== null && fix.accuracyM <= GPS_ABSOLUTE_MAX_ACCURACY_M;
}

/**
 * How close the fix is to unlocking, as 0..1, for the acquisition ring.
 *
 * Inverted and clamped so the ring fills as accuracy improves. Anything at or
 * beyond the absolute maximum reads as zero progress rather than a negative.
 */
export function acquisitionProgress(accuracyM: number | null): number {
  if (accuracyM === null) return 0;
  if (accuracyM <= GPS_ACCURACY_THRESHOLD_M) return 1;
  if (accuracyM >= GPS_ABSOLUTE_MAX_ACCURACY_M) return 0;
  const span = GPS_ABSOLUTE_MAX_ACCURACY_M - GPS_ACCURACY_THRESHOLD_M;
  return (GPS_ABSOLUTE_MAX_ACCURACY_M - accuracyM) / span;
}

/**
 * The fix is locked at the moment of capture and never updated afterwards.
 *
 * Continuing to track would mean a report filed while walking away carries the
 * coordinate of wherever the reporter ended up, not where the incident was.
 */
export function lockFix(fix: LocationFix, capturedAt: Date = new Date()): LockedFix {
  return {
    ...fix,
    capturedAtIso: capturedAt.toISOString(),
    // Negated because getTimezoneOffset returns minutes *behind* UTC.
    capturedAtUtcOffsetMinutes: -capturedAt.getTimezoneOffset(),
  };
}

export interface LockedFix extends LocationFix {
  capturedAtIso: string;
  capturedAtUtcOffsetMinutes: number;
}
