import fs from 'fs';
import path from 'path';

/**
 * Five things a reporter does that used to go nowhere.
 *
 * Each of these looked finished on screen and sent nothing: comments lived on
 * the phone, reactions forgot themselves, a flagged report reached no
 * moderator, the reset email never left, the payout number was never stored,
 * and no phone was ever registered for a notification.
 */

const SRC = path.resolve(__dirname, '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

describe('comments and reactions reach the service', () => {
  test('comments are read and posted through the API', () => {
    const http = code('api/http.ts');
    expect(http).toMatch(/\/incidents\/\$\{encodeURIComponent\(incidentId\)\}\/comments`/);
    /*
     * The body carries the anonymity choice now.
     *
     * `isAnonymous` is only sent when it is true: the service's default is a
     * named comment, and an explicit `false` would be this client asserting
     * something the person never chose.
     */
    expect(http).toMatch(
      /method: 'POST', body: \{ body, \.\.\.\(isAnonymous \? \{ isAnonymous: true \} : \{\}\) \}/,
    );

    const detail = code('features/incident/IncidentDetailScreen.tsx');
    expect(detail).toMatch(/useComments\(incidentId\)/);
    // The composer's choice reaches the request rather than being dropped.
    expect(detail).toMatch(/isAnonymous: draft\.postAnonymously/);
    expect(detail).toMatch(/canPostAnonymously/);
    expect(detail).toMatch(/usePostComment\(incidentId\)/);
  });

  test('the phone-only comment store is gone', () => {
    expect(fs.existsSync(path.join(SRC, 'stores/commentsStore.ts'))).toBe(false);
  });

  test('a reaction is sent, and undone if the service refuses it', () => {
    const hooks = code('hooks/useIncidents.ts');
    expect(hooks).toMatch(/api\.setReaction\(incident\.id, reacted\)\.catch\(/);
  });
});

test('a flagged report reaches a moderator', () => {
  expect(code('api/http.ts')).toMatch(/request<unknown>\('\/abuse'/);
  expect(code('features/incident/IncidentDetailScreen.tsx')).toMatch(/api\s*\.reportAbuse\(\{/);
});

test('the reset email is actually requested', () => {
  const screen = code('features/auth/ForgotPasswordScreen.tsx');
  expect(screen).toMatch(/api\.requestPasswordReset\(/);
  expect(screen).not.toMatch(/setTimeout\(resolve, 600\)/);
});

test('the payout number is saved, and nothing pretends to pay', () => {
  const screen = code('features/earnings/EarningsScreen.tsx');
  expect(screen).toMatch(/api\.setPayoutNumber\(msisdn\)/);
  expect(screen).not.toMatch(/setTimeout\(resolve, 1400\)/);
  expect(code('api/http.ts')).toMatch(/'\/me\/payout-msisdn', \{ method: 'PUT'/);
});

test('a signed-in phone registers for push notifications', () => {
  expect(code('app/_layout.tsx')).toMatch(/if \(accountId\) void registerForPushNotifications\(accountId\)/);
  const push = code('services/pushNotifications.ts');
  expect(push).toMatch(/getDevicePushTokenAsync\(\)/);
  expect(push).toMatch(/api\.registerPushToken\(value\)/);
});
