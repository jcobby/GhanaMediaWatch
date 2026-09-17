import fs from 'fs';
import path from 'path';
import {
  DEFAULT_COMMISSION_RATES,
  bestOffer,
  estimateCommission,
  sanitiseCommissionRates,
  sanitiseOffer,
  type CommissionInput,
} from '../commission';

/**
 * The estimate a reporter sees before sending uses the rates the platform set,
 * and an organisation's higher offer when they send it to that organisation.
 */

const base: CommissionInput = {
  category: 'fire',
  destination: 'marketplace',
  mediaKind: 'photo',
  locationConfidence: 'high',
};

test('the built-in rates stand until the platform sets others', () => {
  expect(estimateCommission(base)).toEqual(estimateCommission(base, DEFAULT_COMMISSION_RATES));
  expect(estimateCommission(base).reporterPesewas).toBe(1_750);
});

test('rates set by the platform change the estimate', () => {
  const rates = sanitiseCommissionRates({ categoryPesewas: { fire: 5_000 }, platformFeeRate: 0.2 });
  expect(estimateCommission(base, rates).reporterPesewas).toBe(4_000);
});

test('served rates are clamped, and bad values keep their defaults', () => {
  const rates = sanitiseCommissionRates({
    categoryPesewas: { fire: 9_999_999, flood: 'free' },
    platformFeeRate: 5,
  });
  expect(rates.categoryPesewas.fire).toBe(100_000);
  expect(rates.categoryPesewas.flood).toBe(2_000);
  expect(rates.platformFeeRate).toBe(0.9);
});

test("an organisation's offer raises a report sent to it, never lowers it", () => {
  const offers = [
    sanitiseOffer({ categoryPesewas: { fire: 4_000 } }, DEFAULT_COMMISSION_RATES),
    sanitiseOffer({ categoryPesewas: { fire: 100 } }, DEFAULT_COMMISSION_RATES),
    sanitiseOffer(undefined, DEFAULT_COMMISSION_RATES),
  ];
  const offer = bestOffer('fire', offers);
  expect(offer).toBe(4_000);

  const withOffer = estimateCommission({ ...base, destination: 'directed', offerPesewas: offer });
  const without = estimateCommission({ ...base, destination: 'directed' });
  expect(withOffer.reporterPesewas).toBeGreaterThan(without.reporterPesewas);
  // Only a directed report: nobody knows who buys one offered to everyone.
  expect(estimateCommission({ ...base, offerPesewas: offer })).toEqual(estimateCommission(base));
});

test('the review screen uses the served rates and the chosen organisations’ offers', () => {
  /*
   * The calculation moved out of `DestinationPicker` into `EarningsEstimate`,
   * and these three assertions moved with it rather than being relaxed.
   *
   * The reason for the move is the bug they could not have caught: the card was
   * rendered a step before the organisations were chosen, so `selected` was
   * always empty. `bestOffer` had nothing to search and `licensedBy` fell to
   * one — the shapes below were all present and correct, and the figure was
   * still wrong. Reading the right rates is necessary, not sufficient; that the
   * inputs exist when it runs is what `reviewSteps.test.ts` now pins.
   */
  const estimate = fs
    .readFileSync(path.resolve(__dirname, '../../capture/EarningsEstimate.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  expect(estimate).toMatch(/const rates = useCommissionRates\(\);/);
  expect(estimate).toMatch(/bestOffer\(category, selected\.map\(\(o\) => sanitiseOffer\(o\.commissionOffer, rates\)\)\)/);
  expect(estimate).toMatch(/offerPesewas,\s*\},\s*rates,\s*\)/);
});
