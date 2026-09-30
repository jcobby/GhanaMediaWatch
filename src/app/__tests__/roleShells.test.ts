import fs from 'fs';
import path from 'path';

/**
 * Each account stays in its own shell.
 *
 * **The hole was on one side only.** `(org)/_layout.tsx` has always redirected
 * a reporter out of the organisation's four tabs; `(tabs)/_layout.tsx` had no
 * reciprocal guard, so an operator signed in to an organisation could swipe
 * back from their inbox and land in the reporter app — feed, outbox, profile
 * and a camera button in the middle of the bar.
 *
 * **Why that is a correctness problem and not an untidiness one.** The centre
 * tab films a report. A report filed from an organisation account is a citizen
 * report on the account that can license it, which means the organisation pays
 * its own commission for footage that reads to everyone else as independent.
 * §8.6 of the backend spec models an institution's own submissions as a
 * separate thing precisely so this cannot happen by accident.
 *
 * The rest of the shell is merely useless to them, which is its own argument:
 * Sending is a reporter's upload queue on an account that never captures,
 * Profile carries payout details for a commission an organisation cannot earn
 * and duplicates the Organisation tab, and the public feed is the product's
 * output rather than their work surface.
 *
 * Source-read: what is being checked is that a guard exists and what it decides
 * on, which is visible in the file. Driving two navigators and a hydrated auth
 * store to watch a redirect fire would test expo-router.
 */

const APP = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), 'utf8');

const REPORTER = read('(tabs)/_layout.tsx');
const ORG = read('(org)/_layout.tsx');
const ROOT = read('_layout.tsx');

test('the files under review were read', () => {
  expect(REPORTER.length).toBeGreaterThan(1000);
  expect(ORG.length).toBeGreaterThan(1000);
});

test('an organisation cannot reach the reporter shell', () => {
  /*
   * The regression this exists for, and it is an absence — the file simply had
   * no guard, which is invisible in review because nothing looks wrong.
   */
  expect(REPORTER).toMatch(/profile\?\.accountType === 'organisation'/);
  expect(REPORTER).toMatch(/<Redirect href=\{homeRouteFor\(profile\)\} \/>/);
});

test('and a reporter cannot reach the organisation shell', () => {
  // The half that already existed. Both directions or neither.
  expect(ORG).toMatch(/if \(!isOrg\) return <Redirect href="\/\(tabs\)" \/>/);
});

test('neither guard decides anything before the keychain is read', () => {
  /*
   * A `Redirect` is a navigation, not a frame. Deciding on a profile that has
   * not loaded sends every reporter to the organisation shell — or every
   * operator to the reporter app — for the moment it takes to hydrate, and it
   * does not come back on its own.
   */
  expect(REPORTER).toMatch(/hydrated && profile\?\.accountType === 'organisation'/);
  expect(ORG).toMatch(/if \(!hydrated\) return null;/);
});

test('a pending organisation is sent to its application, not to four refusals', () => {
  /*
   * `homeRouteFor` rather than a hardcoded `/(org)`. An organisation whose
   * application has not been approved may call `/org/onboarding/*` and nothing
   * else — every other `/org/*` route answers 403 — so sending it to the inbox
   * is four tabs that can each only render a refusal.
   */
  expect(REPORTER).toMatch(/homeRouteFor\(profile\)/);
  expect(REPORTER).not.toMatch(/<Redirect href="\/\(org\)"/);
});

test('a platform owner is left alone', () => {
  /*
   * `homeRouteFor` sends a platform owner to the reporter app deliberately —
   * that work is done in the web console and the phone has no screens for it,
   * so a shell that does not exist would be a blank screen with no way back.
   * The guard therefore keys on `organisation` specifically, never on "not a
   * reporter".
   */
  expect(REPORTER).not.toMatch(/accountType !== 'user'/);
  expect(REPORTER).not.toMatch(/accountType !== 'reporter'/);

  const home = fs.readFileSync(path.resolve(APP, '../lib/homeRoute.ts'), 'utf8');
  expect(home).toMatch(/if \(profile\?\.accountType !== 'organisation'\) return '\/\(tabs\)'/);
});

test('the organisation shell has no back gesture off it', () => {
  /*
   * The guard is what makes the boundary correct; this is what makes it read
   * as one. Without it an operator swipes, sees a frame of the reporter app
   * and is bounced back, which looks like a glitch rather than a rule.
   */
  expect(ROOT).toMatch(/name="\(org\)" options=\{\{ gestureEnabled: false \}\}/);
});
