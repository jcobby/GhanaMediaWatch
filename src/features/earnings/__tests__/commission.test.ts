import {
  estimateCommission,
  isEarning,
  payoutProgress,
  PLATFORM_FEE_RATE,
  sumPesewas,
  type CommissionInput,
} from '../commission';
import { formatCedis } from '@/types/dawuro';

const base: CommissionInput = {
  category: 'flood',
  destination: 'marketplace',
  mediaKind: 'photo',
  locationConfidence: 'high',
};

describe('what earns', () => {
  it('pays nothing for a public-only submission', () => {
    // Visibility is the reward there; implying otherwise sets an expectation
    // the model cannot meet.
    const result = estimateCommission({ ...base, destination: 'public' });
    expect(result).toEqual({ grossPesewas: 0, platformFeePesewas: 0, reporterPesewas: 0 });
    expect(isEarning('public')).toBe(false);
  });

  it('pays for marketplace, directed and both', () => {
    (['marketplace', 'directed', 'both'] as const).forEach((destination) => {
      expect(estimateCommission({ ...base, destination }).reporterPesewas).toBeGreaterThan(0);
      expect(isEarning(destination)).toBe(true);
    });
  });
});

describe('the three figures always reconcile', () => {
  it('gross equals platform fee plus reporter share, exactly', () => {
    // Rounding the reporter share separately would leave the ledger a pesewa
    // out on some inputs, and a ledger that does not balance is worthless.
    const inputs: CommissionInput[] = [
      base,
      { ...base, category: 'corruption', mediaKind: 'video' },
      { ...base, destination: 'directed', locationConfidence: 'low' },
      { ...base, category: 'other', licensedBy: 3 },
    ];
    inputs.forEach((input) => {
      const { grossPesewas, platformFeePesewas, reporterPesewas } = estimateCommission(input);
      expect(platformFeePesewas + reporterPesewas).toBe(grossPesewas);
    });
  });

  it('returns whole pesewas, never fractions', () => {
    const result = estimateCommission({ ...base, mediaKind: 'video', locationConfidence: 'low' });
    expect(Number.isInteger(result.grossPesewas)).toBe(true);
    expect(Number.isInteger(result.platformFeePesewas)).toBe(true);
    expect(Number.isInteger(result.reporterPesewas)).toBe(true);
  });

  it('takes roughly the stated platform share', () => {
    const { grossPesewas, platformFeePesewas } = estimateCommission(base);
    expect(platformFeePesewas / grossPesewas).toBeCloseTo(PLATFORM_FEE_RATE, 2);
  });
});

describe('what the platform pays more for', () => {
  it('pays more for video than for a photo', () => {
    const photo = estimateCommission(base).reporterPesewas;
    const video = estimateCommission({ ...base, mediaKind: 'video' }).reporterPesewas;
    expect(video).toBeGreaterThan(photo);
  });

  it('pays more for an exclusive directed report', () => {
    const open = estimateCommission(base).reporterPesewas;
    const exclusive = estimateCommission({ ...base, destination: 'directed' }).reporterPesewas;
    expect(exclusive).toBeGreaterThan(open);
  });

  it('pays more for urgent categories than for routine ones', () => {
    // A fire is worth something for minutes; a pothole is worth the same next
    // week. Paying identically would tell reporters urgency is worthless.
    const fire = estimateCommission({ ...base, category: 'fire' }).reporterPesewas;
    const pothole = estimateCommission({ ...base, category: 'infrastructure' }).reporterPesewas;
    expect(fire).toBeGreaterThan(pothole);
  });

  it('pays less for a low-confidence location but still pays', () => {
    const low = estimateCommission({ ...base, locationConfidence: 'low' }).reporterPesewas;
    const high = estimateCommission(base).reporterPesewas;
    expect(low).toBeLessThan(high);
    // Refusing it outright would waste a report a dispatcher could still use.
    expect(low).toBeGreaterThan(0);
  });

  it('increases with each additional licensee, at a diminishing rate', () => {
    const one = estimateCommission({ ...base, licensedBy: 1 }).reporterPesewas;
    const two = estimateCommission({ ...base, licensedBy: 2 }).reporterPesewas;
    const three = estimateCommission({ ...base, licensedBy: 3 }).reporterPesewas;
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    // The second buyer values the footage less than the first.
    expect(three - two).toBeLessThanOrEqual(two - one);
  });

  it('treats a missing or nonsensical licensee count as one', () => {
    const implicit = estimateCommission(base).reporterPesewas;
    expect(estimateCommission({ ...base, licensedBy: 0 }).reporterPesewas).toBe(implicit);
    expect(estimateCommission({ ...base, licensedBy: -4 }).reporterPesewas).toBe(implicit);
  });
});

describe('ledger helpers', () => {
  it('sums an empty ledger to zero rather than NaN', () => {
    expect(sumPesewas([])).toBe(0);
  });

  it('sums exactly, with no floating-point drift', () => {
    // 1,000 entries of 3.33 cedis. Done in decimal cedis this lands off by a
    // fraction; in pesewas it is exact.
    const entries = Array.from({ length: 1000 }, () => 333);
    expect(sumPesewas(entries)).toBe(333_000);
  });

  it('reports payout progress as a clamped fraction', () => {
    expect(payoutProgress(0, 5_000)).toBe(0);
    expect(payoutProgress(2_500, 5_000)).toBe(0.5);
    expect(payoutProgress(9_999, 5_000)).toBe(1);
  });

  it('treats a zero threshold as already met', () => {
    expect(payoutProgress(0, 0)).toBe(1);
  });
});

describe('money formatting', () => {
  it('always shows two decimal places', () => {
    expect(formatCedis(0)).toBe('GH₵0.00');
    expect(formatCedis(50)).toBe('GH₵0.50');
    expect(formatCedis(2_500)).toBe('GH₵25.00');
  });

  it('compacts large balances only when asked', () => {
    expect(formatCedis(1_250_000, { compact: true })).toBe('GH₵12.5k');
    expect(formatCedis(1_250_000)).toContain('12,500');
  });
});
