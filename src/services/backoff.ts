import { UPLOAD_RETRY_BACKOFF_MS, UPLOAD_RETRY_JITTER_RATIO } from '@/lib/constants';

/**
 * Retry scheduling for the upload queue.
 *
 * Deliberately pure and free of platform imports so it can be unit-tested
 * without a device, a clock, or a network — the whole point of separating it
 * from the sync engine that calls it.
 */

/**
 * Base delay before attempt number `attemptCount + 1`, in milliseconds.
 *
 * `attemptCount` is the number of failures so far, so 0 means "about to make
 * the first retry". Past the end of the schedule the final value repeats: the
 * queue keeps trying hourly rather than abandoning a report, because a phone
 * that has been in a dead zone for a day should still deliver its footage.
 */
export function baseDelayMs(attemptCount: number): number {
  const index = Math.max(0, Math.min(attemptCount, UPLOAD_RETRY_BACKOFF_MS.length - 1));
  return UPLOAD_RETRY_BACKOFF_MS[index]!;
}

/**
 * Base delay with symmetric jitter applied.
 *
 * Without jitter, every phone that lost signal at the same moment — a tower
 * outage, a power cut — retries in lockstep the instant it returns, and the
 * backend sees a synchronised spike instead of a smooth ramp. `random` is
 * injectable so tests can pin it rather than assert on a range.
 */
export function jitteredDelayMs(attemptCount: number, random: () => number = Math.random): number {
  const base = baseDelayMs(attemptCount);
  // Map [0,1) onto [-1,1) so the jitter pulls earlier as often as later.
  const swing = (random() * 2 - 1) * UPLOAD_RETRY_JITTER_RATIO;
  return Math.max(0, Math.round(base * (1 + swing)));
}

/** Epoch milliseconds at which the next attempt becomes eligible. */
export function nextRetryAt(
  attemptCount: number,
  now: number = Date.now(),
  random: () => number = Math.random,
): number {
  return now + jitteredDelayMs(attemptCount, random);
}

/** True when a scheduled retry is due. A null schedule means "eligible now". */
export function isRetryDue(nextRetryAtMs: number | null, now: number = Date.now()): boolean {
  if (nextRetryAtMs === null) return true;
  return now >= nextRetryAtMs;
}
