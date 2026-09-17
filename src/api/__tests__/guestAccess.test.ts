import { HttpApiClient } from '../http';
import { ApiError } from '@/types/api';
import en from '@/i18n/locales/en.json';

/**
 * A guest reaching something that needs an account.
 *
 * The server issues two kinds of token. A device token is minted for the phone
 * with nobody signed in — it can read the feed, file a report and upload the
 * footage — and the `/me/*` endpoints are refused to it. Verified against the
 * live API: `/me/incidents` answers 403 FORBIDDEN to a device token and 200 to
 * a user token.
 *
 * FORBIDDEN is correct and unhelpful. It is the same code a signed-in reporter
 * gets when they genuinely lack a permission, and those two people need
 * opposite advice: the guest needs "make an account", the member needs "ask
 * your administrator". The app was giving both of them the second one, so
 * somebody who had chosen "report as a guest" — an option the onboarding
 * offers — was told to contact the administrator of an organisation they had
 * never joined.
 */

let storedKind: 'device' | 'user' = 'device';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));

jest.mock('@/services/deviceIdentity', () => ({
  getDeviceId: async () => 'device-1',
  getPlatformDeviceId: async () => null,
}));

jest.mock('@/services/session', () => ({
  session: {
    // Reads the module-level `storedKind`, so each test can choose which kind
    // of caller is holding the phone.
    read: async () => ({
      accessToken: 'token',
      refreshToken: null,
      expiresAt: '2099-01-01',
      kind: (globalThis as unknown as { __kind: string }).__kind,
    }),
    save: async () => undefined,
    clear: async () => undefined,
    isStale: () => false,
  },
}));

function forbid() {
  global.fetch = (() =>
    Promise.resolve({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'Token cannot access this endpoint.' },
        }),
    } as Response)) as unknown as typeof fetch;
}

/*
 * Static import, not a dynamic one: the session mock reads the kind at call
 * time, so nothing here needs the module re-evaluated — and `await import` is
 * unavailable under this Jest configuration.
 */
function client() {
  (globalThis as unknown as { __kind: string }).__kind = storedKind;
  return new HttpApiClient('https://example.test/v1');
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  storedKind = 'device';
  forbid();
});

afterEach(() => jest.restoreAllMocks());

test('a guest asking for their own reports is told to make an account', async () => {
  const api = client();
  await expect(api.getMyIncidents()).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' });
});

test('a guest asking for their earnings gets the same answer', async () => {
  // Earnings is the sharper case: it is the screen that explains why an account
  // is worth having at all, so an administrator error here is doubly wrong.
  const api = client();
  await expect(api.getEarnings()).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' });
});

test('a signed-in reporter keeps the real permissions message', async () => {
  /*
   * The opposite failure, and the reason this is not simply "map every 403".
   * Telling a member of an organisation to create an account sends them round a
   * loop that cannot resolve their problem — they already have one.
   */
  storedKind = 'user';
  const api = client();
  await expect(api.getMyIncidents()).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('a 403 outside /me keeps the real permissions message', async () => {
  /*
   * The narrowing itself. `/me/*` is the only family the server refuses purely
   * for being a guest; a 403 anywhere else is a genuine permissions failure,
   * and dressing it up as "create an account" would send a signed-in reporter
   * to a screen that changes nothing.
   */
  const api = client();
  await expect(api.getComments('inc_x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('a guest is not offered sign-in for a network failure', async () => {
  // Sign-in advice for an outage would have the reporter typing credentials
  // into a phone that cannot reach the server.
  global.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
  const api = client();
  await expect(api.getMyIncidents()).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
});

test('the message tells a guest what an account gets them', async () => {
  /*
   * "Sign in required" is a locked door. The reason somebody made this app is
   * that their footage reaches a newsroom and can earn them something, and this
   * is the moment to say so — it is where a guest first bumps into the limit.
   */
  const all = en.apiError as unknown as Record<string, { title: string; body: string } | undefined>;
  const copy = all.SIGN_IN_REQUIRED;
  expect(copy).toBeTruthy();
  expect(copy!.body).toMatch(/queued|stay put|still reach/i);
  expect(copy!.body).not.toMatch(/administrator/i);
});

test('the two messages have not been collapsed into one', async () => {
  const all = en.apiError as unknown as Record<string, { title: string; body: string } | undefined>;
  expect(all.FORBIDDEN!.body).toMatch(/administrator/i);
  expect(all.SIGN_IN_REQUIRED!.body).not.toBe(all.FORBIDDEN!.body);
});

test('the client-side code is a real ApiError code', () => {
  // Otherwise the error surfaces with no copy at all and falls through to the
  // generic "something went wrong".
  const err = new ApiError({
    code: 'SIGN_IN_REQUIRED',
    status: 403,
    message: 'x',
    retryable: false,
  });
  expect(err.code).toBe('SIGN_IN_REQUIRED');
  expect(err.retryable).toBe(false);
});
