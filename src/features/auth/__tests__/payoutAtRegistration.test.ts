import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * Where a reporter's money goes, asked for while the account is being made.
 *
 * **A commission with no wallet behind it is held, not paid.** The number was
 * collected on the earnings screen, which somebody opens *after* an
 * organisation has licensed their footage and they have gone looking for the
 * money. By then the platform owes them something it cannot send, and the
 * first they hear of it is its absence.
 *
 * So it is a step of registration. Three for a reporter — what kind of account,
 * their details, where they get paid — and two for an organisation, which pays
 * for subscriptions through the checkout rather than receiving commissions.
 *
 * **Mobile money only, and that is a service limit rather than a choice.**
 * `PUT /me/payout-msisdn` is the only payout field the API has: there is no
 * account number, bank name, branch or account holder on any endpoint. A bank
 * form here would be inputs that reach nothing, so the bank half is specified
 * in BACKEND-REQUESTS.md instead of mocked up.
 */

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const SCREEN = read('features/auth/SignUpScreen.tsx');
const SCHEMA = read('features/auth/schemas.ts');

test('the files under review exist and were read', () => {
  // A rename would empty this file and every assertion below would pass.
  expect(SCREEN.length).toBeGreaterThan(2000);
  expect(SCHEMA.length).toBeGreaterThan(1000);
});

test('registration has a step for it, rather than one more field', () => {
  /*
   * On its own screen for the same reason the account kind is: it is not one
   * more input among eight. Buried in the list it gets the attention of a
   * field, and the consequence of skipping it is invisible until payday.
   */
  expect(SCREEN).toMatch(/useState<'kind' \| 'details' \| 'payout'>\('kind'\)/);
  expect(SCREEN).toMatch(/step === 'payout'/);
});

test('the details step advances rather than submitting', () => {
  /*
   * `trigger` on the fields that step owns, not `handleSubmit`.
   *
   * The resolver validates the whole schema, so submitting from the details
   * step fails on a payout number the person has not been shown — an error on
   * a field that is not on screen, which reads as a button that does nothing.
   */
  expect(SCREEN).toMatch(/trigger\(\[\s*'displayName',\s*'email',\s*'password'/);
  expect(SCREEN).toMatch(/if \(ok\) setStep\('payout'\)/);
});

test('the number is checked on the phone, by the function the service agrees with', () => {
  /*
   * `toGhanaMsisdn` is what the earnings screen and the API client already
   * use, so a number accepted at registration is one `PUT /me/payout-msisdn`
   * accepts. A second, looser check here would let a typo through to become a
   * payout that never arrives.
   *
   * It lives in `lib/` rather than in the earnings feature now that two
   * features need it — a second copy is how the two rules drift apart.
   */
  expect(SCHEMA).toMatch(/import \{ toGhanaMsisdn \} from '@\/lib\/momo'/);
  expect(SCREEN).toMatch(/import \{ toGhanaMsisdn \} from '@\/lib\/momo'/);
  expect(fs.existsSync(path.join(SRC, 'lib/momo.ts'))).toBe(true);
  expect(fs.existsSync(path.join(SRC, 'features/earnings/momo.ts'))).toBe(false);
});

test('an organisation is never asked', () => {
  /*
   * It pays for subscriptions through the checkout rather than receiving
   * commissions, and the service has nothing to attach a payment method to
   * before the organisation exists. Requiring one would block an application
   * on a field its form does not render.
   */
  expect(SCREEN).toMatch(/if \(values\.accountKind !== 'organisation'\) \{/);
  expect(SCREEN).toMatch(/isOrganisation \? t\('auth\.createAccount'\) : t\('common\.continue'\)/);
});

test('a failed save does not throw the account away', () => {
  /*
   * The ordering makes this reachable: `/auth/register` takes no payout
   * number, so saving it is a second call against the session the first one
   * minted. By the time it can fail, the account exists.
   *
   * Treating that as a failed registration would strand somebody whose
   * account is real and whose password they have just chosen — the retry
   * answers "that email is already taken", which is true and useless. They are
   * let through knowing commissions are held until the number is on file.
   */
  const submit = SCREEN.slice(SCREEN.indexOf('const onSubmit'), SCREEN.indexOf('return ('));
  expect(submit).toMatch(/await api\.setPayoutNumber\(msisdn\)/);
  expect(submit).toMatch(/catch \{[\s\S]{0,900}auth\.payoutSaveFailedTitle/);
  // And the save is attempted only after registration has returned.
  expect(submit.indexOf('await register(')).toBeLessThan(submit.indexOf('setPayoutNumber'));
});

test('the copy says why it is being asked now', () => {
  /*
   * "Enter your mobile money number" on a registration form reads as one more
   * thing being harvested. What makes it answerable is the consequence of not
   * answering, which is the part a reporter cannot otherwise know.
   */
  const auth = en.auth as unknown as Record<string, string>;
  for (const key of ['payoutQuestion', 'payoutLabel', 'payoutHelp', 'payoutWhyNow']) {
    expect([key, typeof auth[key]]).toEqual([key, 'string']);
  }
  expect(auth.payoutWhyNow).toMatch(/held/i);
  expect(auth.payoutHelp).toMatch(/commission/i);
  // Named networks, because "mobile money" alone leaves people guessing
  // whether theirs counts.
  expect(auth.payoutHelp).toMatch(/MTN|Telecel|AirtelTigo/);
});
