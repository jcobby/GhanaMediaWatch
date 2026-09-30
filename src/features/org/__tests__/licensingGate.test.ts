import fs from 'fs';
import path from 'path';
import { licenceRefusal } from '@/lib/licensing';
import { VETTING_STATES } from '@/types/api';
import en from '@/i18n/locales/en.json';

/**
 * A report that cannot be licensed does not offer to be.
 *
 * **The phone offered the button on everything and let the service refuse.**
 * Tapping "License this report" on an integrity-flagged report answered
 * *"Not available on this account. This account does not have access to that.
 * If you think it should, contact your organisation's administrator"* — an
 * account-permissions message for what is a fact about the *report*. It sent an
 * operator to an administrator who could not have helped, about a refusal that
 * was entirely correct.
 *
 * The rule is the server's and the console's both: licensing charges the
 * organisation *and pays the reporter*, so material the platform cannot stand
 * behind must not be sellable. `restricted` is this client's collapse of
 * `integrity_flagged` and `disputed`; `rejected` failed review outright.
 */

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('the rule', () => {
  test('a flagged or rejected report is refused; anything else is offered', () => {
    expect(licenceRefusal('restricted')).toBe('restricted');
    expect(licenceRefusal('rejected')).toBe('rejected');
    expect(licenceRefusal('published')).toBeNull();
    expect(licenceRefusal('pending_review')).toBeNull();
  });

  test('every vetting state is decided, so a new one cannot fall through', () => {
    /*
     * A state added later must be considered rather than silently treated as
     * licensable — the safe direction here is refusing, and the unsafe one
     * sells footage nobody has cleared.
     */
    for (const state of VETTING_STATES) {
      expect([state, licenceRefusal(state)]).toEqual([
        state,
        state === 'restricted' || state === 'rejected' ? state : null,
      ]);
    }
  });

  test('the two refusals are told apart, because they mean different things', () => {
    // `rejected` is final; `restricted` is waiting on an editor and may clear.
    expect(licenceRefusal('rejected')).not.toBe(licenceRefusal('restricted'));
    expect(en.org.blockedRejectedBody).toMatch(/will not become available/i);
    expect(en.org.blockedRestrictedBody).toMatch(/editor/i);
  });
});

describe('the screen', () => {
  const SCREEN = read('features/org/OrgReportScreen.tsx');

  test('the button is behind the rule, not offered and then refused', () => {
    expect(SCREEN).toMatch(/licenceRefusal\(report\.vettingState\)/);
    // The action and the explanation are alternatives — never both, never neither.
    expect(SCREEN).toMatch(/blocked \?/);
  });

  test('the reason is stated in the screen, not left to the server to word', () => {
    expect(SCREEN).toMatch(/t\('org\.blockedRejected'\)/);
    expect(SCREEN).toMatch(/t\('org\.blockedRestricted'\)/);
    expect(SCREEN).toMatch(/t\('org\.blockedRejectedBody'\)/);
    expect(SCREEN).toMatch(/t\('org\.blockedRestrictedBody'\)/);
  });

  test('the keys are literal, so a missing string cannot ship unnoticed', () => {
    /*
     * This first read `t(`${blocked}Body`)`, which is invisible twice over: the
     * orphan check cannot see the key is used, and nothing can see when the
     * string is absent — a constructed key that misses renders its own name.
     */
    expect(SCREEN).not.toMatch(/t\(`\$\{blocked\}/);
  });

  test('the list says the same thing the detail screen will', () => {
    /*
     * A row badged "New" on a report that cannot be bought is the list telling
     * a lie the next screen has to correct — the same fault as offering the
     * button and letting the service refuse, one screen earlier. Both read the
     * one rule, so they cannot drift apart.
     */
    const ROW = read('features/org/OrgReportRow.tsx');
    expect(ROW).toMatch(/licenceRefusal\(report\.vettingState\)/);
    expect(ROW).toMatch(/t\('org\.badgeRejected'\)/);
    expect(ROW).toMatch(/t\('org\.badgeInReview'\)/);
    // And "New" survives for a report that genuinely is.
    expect(ROW).toMatch(/t\('org\.new'\)/);
  });

  test('the licensee is not told which check failed', () => {
    /*
     * §4.2: `integrity_flagged` shows the specific flag to authorised
     * reviewers only. The editorial desk shows it; a licensee is told the
     * report is flagged and not which signal it was, because some of those
     * describe the reporter's own device.
     */
    expect(en.org.blockedRestrictedBody).not.toMatch(/clock|GPS|device|signature|rooted/i);
  });
});
