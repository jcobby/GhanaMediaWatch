import { HttpApiClient } from '../http';

/**
 * Every state-creating POST carries an Idempotency-Key.
 *
 * The server rejects a POST without one. Only `createIncident` was passing a
 * key, so account creation failed on a real device with "Idempotency-Key header
 * is required" — and sign-in, comments and reactions would each have failed the
 * same way the moment anyone reached them.
 *
 * The header also has to survive the auth replay. When a token is rejected the
 * client clears it, re-registers and repeats the request; if that repeat
 * carried a *new* key the server would treat it as a second operation, which
 * for a comment or a report means posting it twice. That path is the reason
 * this is generated once and threaded through rather than made per-attempt.
 */

const captured: { url: string; init: RequestInit }[] = [];

/*
 * `expo-crypto` is a native module: under Jest its `randomUUID` is not a real
 * function, so the generated key came out undefined and every assertion here
 * failed for a reason that has nothing to do with the code under test.
 */
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

jest.mock('@/services/deviceIdentity', () => ({
  getDeviceId: async () => 'device-1',
  getPlatformDeviceId: async () => null,
}));

jest.mock('@/services/session', () => ({
  session: {
    read: async () => ({ accessToken: 'token', refreshToken: null, expiresAt: '2099-01-01' }),
    save: async () => undefined,
    clear: async () => undefined,
    isStale: () => false,
  },
}));

const headerOf = (i: number, name: string) =>
  (captured[i]!.init.headers as Record<string, string>)[name];

beforeEach(() => {
  captured.length = 0;
  global.fetch = ((url: string, init: RequestInit) => {
    captured.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      // Satisfies both shapes the calls below parse: a token envelope and a
      // page. The assertions are about headers, not bodies.
      text: async () =>
        JSON.stringify({
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: 'x',
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
    } as Response);
  }) as unknown as typeof fetch;
});

test('registering sends a key', async () => {
  // The call that actually failed on the phone.
  const api = new HttpApiClient('https://example.test/v1');
  await api.register({ email: 'a@b.gh', password: 'pw-long-enough', displayName: 'Ama' });

  expect(headerOf(0, 'Idempotency-Key')).toBeTruthy();
});

test('signing in sends a key', async () => {
  const api = new HttpApiClient('https://example.test/v1');
  await api.signIn({ email: 'a@b.gh', password: 'pw-long-enough' });

  expect(headerOf(0, 'Idempotency-Key')).toBeTruthy();
});

test('two separate calls get different keys', async () => {
  /*
   * They are different operations. Reusing one key would make the second
   * request return the first one's response — which for two genuinely distinct
   * submissions loses the second entirely.
   */
  const api = new HttpApiClient('https://example.test/v1');
  await api.signIn({ email: 'a@b.gh', password: 'pw-long-enough' });
  await api.signIn({ email: 'a@b.gh', password: 'pw-long-enough' });

  expect(headerOf(0, 'Idempotency-Key')).not.toBe(headerOf(1, 'Idempotency-Key'));
});

test('a caller-supplied key is not overwritten', async () => {
  /*
   * The outbox passes the report's own `clientId` so a submission replayed from
   * disk days later is still recognised as the same one. Generating over that
   * would let a flaky connection file the same report twice.
   */
  const api = new HttpApiClient('https://example.test/v1');
  await api.createIncident({ clientId: 'stable-client-id' } as never, 'stable-client-id');

  expect(headerOf(0, 'Idempotency-Key')).toBe('stable-client-id');
});

test('a GET carries no key', async () => {
  // Nothing is created, so there is nothing to deduplicate.
  const api = new HttpApiClient('https://example.test/v1');
  await api.getFeed({ limit: 1 });

  expect(headerOf(0, 'Idempotency-Key')).toBeUndefined();
});

test('the tunnel bypass header is always present', async () => {
  /*
   * Unrelated to idempotency, but it travels on the same request and its
   * absence is just as invisible: a dev tunnel answers an unrecognised client
   * with an HTML interstitial, and every response then fails to parse with
   * "unexpected token <".
   */
  const api = new HttpApiClient('https://example.test/v1');
  await api.getFeed({ limit: 1 });

  expect(headerOf(0, 'X-Tunnel-Skip-AntiPhishing-Page')).toBe('true');
});

test('the auth replay reuses the same key', async () => {
  /*
   * The case the whole threading exists for.
   *
   * A rejected token is recoverable once: the client clears it, registers
   * again, and repeats the request. If that repeat carried a fresh key the
   * server would see two distinct operations — and for a comment or a report,
   * two distinct operations means it is posted twice.
   *
   * Nothing about that is visible in normal use. It only happens when a token
   * expires mid-flight, which is exactly when nobody is watching.
   */
  let call = 0;
  global.fetch = ((url: string, init: RequestInit) => {
    captured.push({ url, init });
    call += 1;
    // First attempt is rejected for a stale token; the replay succeeds.
    if (call === 1) {
      return Promise.resolve({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'stale' } }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [], nextCursor: null, hasMore: false }),
    } as Response);
  }) as unknown as typeof fetch;

  const api = new HttpApiClient('https://example.test/v1');
  await api.createIncident({ clientId: 'c1' } as never, 'c1');

  expect(captured.length).toBeGreaterThanOrEqual(2);
  expect(headerOf(0, 'Idempotency-Key')).toBe(headerOf(1, 'Idempotency-Key'));
});
