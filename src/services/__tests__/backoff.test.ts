import { baseDelayMs, isRetryDue, jitteredDelayMs, nextRetryAt } from '../backoff';
import { UPLOAD_RETRY_BACKOFF_MS, UPLOAD_RETRY_JITTER_RATIO } from '@/lib/constants';

describe('backoff schedule', () => {
  it('follows the documented ramp', () => {
    expect(UPLOAD_RETRY_BACKOFF_MS.map((_, i) => baseDelayMs(i))).toEqual([
      2_000, 8_000, 30_000, 120_000, 600_000, 3_600_000,
    ]);
  });

  it('holds at the cap instead of abandoning the report', () => {
    const cap = UPLOAD_RETRY_BACKOFF_MS[UPLOAD_RETRY_BACKOFF_MS.length - 1];
    expect(baseDelayMs(50)).toBe(cap);
    expect(baseDelayMs(5_000)).toBe(cap);
  });

  it('treats a negative attempt count as the first attempt', () => {
    expect(baseDelayMs(-3)).toBe(UPLOAD_RETRY_BACKOFF_MS[0]);
  });
});

describe('jitter', () => {
  it('is symmetric — it pulls earlier as often as later', () => {
    // Without symmetry the queue drifts steadily later on every retry.
    expect(jitteredDelayMs(0, () => 0)).toBeLessThan(baseDelayMs(0));
    expect(jitteredDelayMs(0, () => 1)).toBeGreaterThan(baseDelayMs(0));
    expect(jitteredDelayMs(0, () => 0.5)).toBe(baseDelayMs(0));
  });

  it('stays inside the configured ratio', () => {
    const base = baseDelayMs(2);
    const bound = base * UPLOAD_RETRY_JITTER_RATIO;
    for (let i = 0; i <= 20; i++) {
      const delay = jitteredDelayMs(2, () => i / 20);
      expect(Math.abs(delay - base)).toBeLessThanOrEqual(bound + 1);
    }
  });

  it('spreads a synchronised fleet rather than letting it retry in lockstep', () => {
    // A tower outage ends and ten thousand phones reconnect at once. Without
    // jitter every one of them retries in the same millisecond.
    const delays = new Set(
      Array.from({ length: 200 }, (_, i) => jitteredDelayMs(1, () => i / 200)),
    );
    expect(delays.size).toBeGreaterThan(100);
  });

  it('never schedules in the past', () => {
    expect(jitteredDelayMs(0, () => 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('retry eligibility', () => {
  it('treats a null schedule as due now', () => {
    expect(isRetryDue(null, 1_000)).toBe(true);
  });

  it('is due only once the clock reaches the scheduled moment', () => {
    expect(isRetryDue(1_000, 999)).toBe(false);
    expect(isRetryDue(1_000, 1_000)).toBe(true);
    expect(isRetryDue(1_000, 1_001)).toBe(true);
  });

  it('schedules relative to the supplied clock, not the wall clock', () => {
    expect(nextRetryAt(0, 5_000, () => 0.5)).toBe(5_000 + baseDelayMs(0));
  });
});
