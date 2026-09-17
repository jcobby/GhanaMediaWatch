import { toGhanaMsisdn } from '../momo';

/**
 * The payout number reaches the service in one form, however it was typed.
 *
 * A wrong number is a payout that fails weeks later, so it is caught on the
 * phone, where the reporter can still fix it.
 */

test.each([
  ['024 123 4567', '+233241234567'],
  ['0241234567', '+233241234567'],
  ['233241234567', '+233241234567'],
  ['+233 24 123 4567', '+233241234567'],
  ['241234567', '+233241234567'],
  ['055-123-4567', '+233551234567'],
])('%s is %s', (typed, stored) => {
  expect(toGhanaMsisdn(typed)).toBe(stored);
});

test.each([
  [''],
  ['12345'],
  ['0241234'],
  ['+44 7700 900123'],
  ['0331234567'], // not a mobile prefix
])('%s is refused', (typed) => {
  expect(toGhanaMsisdn(typed)).toBeNull();
});
