import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { receiving } from '@/hooks/useOrganisations';

/**
 * The screen must not promise money nobody can pay.
 *
 * Three of the four destinations need an organisation to exist: offer to
 * organisations, send to named organisations, and both. Where none has joined,
 * all three route a report to nobody — while the panel
 * underneath quoted a commission for it, and "offer to organisations" was the
 * default.
 *
 * Somebody films a fire at real risk partly because a screen said it could earn
 * them seven cedis. If nothing can license it that was never true, and they
 * would find out weeks later, if at all.
 */

const PICKER = fs.readFileSync(path.resolve(__dirname, '..', 'DestinationPicker.tsx'), 'utf8');

test('the picker knows when nobody can license a report', () => {
  expect(PICKER).toMatch(/const nobodyIsBuying =/);
  // Derived from the live directory, not assumed.
  expect(PICKER).toMatch(/available\.length === 0/);
});

test('an empty directory is not mistaken for a failed one', () => {
  /*
   * "Could not load organisations" and "no organisation has joined" mean
   * opposite things: the first is temporary and the second is the state of the
   * platform. Treating a failed fetch as "nobody is buying" would tell somebody
   * their report cannot earn when it might.
   */
  expect(PICKER).toMatch(/!directoryPending && !directoryFailed && available\.length === 0/);
});

test('no commission is quoted when nothing can be licensed', () => {
  const estimate = PICKER.slice(PICKER.indexOf('{/* Earnings estimate */}'));
  expect(estimate).toMatch(/nobodyIsBuying\s*\?\s*t\('destination\.nobodyBuyingTitle'\)/);
  // The quote is still reachable for when organisations exist.
  expect(estimate).toMatch(/destination\.estimatedEarning/);

  /*
   * And the condition has to mean something.
   *
   * A probe that hardcoded `nobodyIsBuying = false` left the branch above
   * intact and this test passing — the shape was right and the behaviour was
   * back to promising money unconditionally.
   */
  expect(PICKER).not.toMatch(/const nobodyIsBuying = (false|true);/);
});

test('the three inert choices are marked, not hidden', () => {
  /*
   * Hiding them would misrepresent the product — footage can be sold, and a
   * reporter should know that. Leaving them unmarked lets somebody pick one
   * and get nothing. Marked is the only honest middle.
   */
  expect(PICKER).toMatch(/const inert = nobodyIsBuying && option\.value !== 'public'/);
  expect(PICKER).toMatch(/destination\.notAvailableYet/);
});

test('the public feed is never marked unavailable', () => {
  // It is the one destination that works with no organisations at all.
  expect(PICKER).toMatch(/option\.value !== 'public'/);
});

test('the wording says why, and what still works', () => {
  const copy = en.destination as unknown as Record<string, string>;
  expect(copy.nobodyBuyingHelp).toMatch(/no organisation/i);
  // Somebody who cannot be paid can still be read.
  expect(copy.nobodyBuyingHelp).toMatch(/public feed/i);
  expect(Boolean(copy.notAvailableYet)).toBe(true);
});

// ─── who can actually receive a report ─────────────────────────────────────

test('an organisation the public directory lists can receive a report', () => {
  /*
   * The bug this file exists to prevent, arriving by a different route.
   *
   * `receiving()` filtered the directory on `subscriptionStatus === 'active' ||
   * 'trialing'` — a field `GET /organisations` does not send. Verified against
   * the live service, the endpoint returns exactly:
   *
   *   {"id":"org_4dfe…","name":"BBC World News","sector":"government",
   *    "verified":true,"logoUrl":null,"publishedCount":0,"openSurveyCount":0}
   *
   * So every organisation failed the test, the list was always empty, and the
   * capture screen told every reporter "No buyers yet" and "no organisation has
   * joined the platform" — permanently, with two verified newsrooms listed.
   *
   * It did not error and it did not look broken. It quietly removed the only
   * reason to send a report to a newsroom rather than to the feed.
   */
  const directory = [
    { id: 'org_1', name: 'BBC World News', sector: 'media', verified: true, logoUrl: null },
    { id: 'org_2', name: 'Adom TV News', sector: 'government', verified: true, logoUrl: null },
  ] as Parameters<typeof receiving>[0];

  expect(receiving(directory)).toHaveLength(2);
});

test('an unverified organisation cannot', () => {
  // `verified` is the platform's own word that an organisation is real and
  // approved. It is the one thing this endpoint says about eligibility.
  const directory = [
    { id: 'org_1', name: 'Not approved', sector: 'media', verified: false, logoUrl: null },
  ] as Parameters<typeof receiving>[0];

  expect(receiving(directory)).toHaveLength(0);
});

test('receiving does not read a field the directory never sends', () => {
  /*
   * The rule, not just the symptom. Any filter on billing state here is the
   * same bug again: the endpoint does not carry it, so the test can only ever
   * be false, and the failure is silent.
   */
  const source = fs
    .readFileSync(path.resolve(__dirname, '../../../hooks/useOrganisations.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  expect(source).not.toMatch(/subscriptionStatus/);
  expect(source).toMatch(/o\.verified/);
});

test('the directory row is typed as what the endpoint sends', () => {
  /*
   * `OrganisationAccount` was doing two jobs — the full organisation record and the
   * public directory row — so billing, tier and interests were declared
   * required and were undefined on every row the phone actually received. A
   * separate type is what stops the next filter being written against a field
   * that is not there.
   */
  const types = fs.readFileSync(path.resolve(__dirname, '../../../types/dawuro.ts'), 'utf8');
  expect(types).toMatch(/export interface DirectoryOrganisation/);

  const block = types.slice(types.indexOf('export interface DirectoryOrganisation'));
  const body = block.slice(0, block.indexOf('}'));
  for (const absent of ['subscriptionStatus', 'tier', 'interests', 'seatsUsed']) {
    expect([absent, body.includes(absent)]).toEqual([absent, false]);
  }
});
