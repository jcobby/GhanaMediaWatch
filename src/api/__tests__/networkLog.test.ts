/**
 * The network log is the only network inspector this app has.
 *
 * Chrome's Network tab is unavailable to the React Native runtime — the panel
 * reports "Network inspection is disabled" from the debugger frontend and there
 * is no JS-side switch that turns it on. So every question of the form "what did
 * the phone actually send, and what came back" has to be answerable from Metro's
 * console, or it cannot be answered at all.
 *
 * That makes these lines load-bearing rather than decorative, and the failures
 * worth guarding are the silent ones: a body that stops being printed, a
 * password that starts being printed, or a request id that goes missing from a
 * 500 — the one string that lets the backend find the failure in their logs.
 */

const captured: { url: string; init: RequestInit }[] = [];
const logged: string[] = [];

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

/** Everything the client printed during one call, as a single blob. */
const output = () => logged.join('\n');

function respondWith(status: number, body: unknown) {
  global.fetch = ((url: string, init: RequestInit) => {
    captured.push({ url, init });
    return Promise.resolve({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    } as Response);
  }) as unknown as typeof fetch;
}

/**
 * A fresh client with the module re-evaluated under the given environment.
 *
 * `NETWORK_BODIES` is read once at import, so the switched-off case cannot be
 * reached by mutating `process.env` after the fact — the module has to be
 * loaded again.
 */
async function clientWith(env: Record<string, string | undefined>) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  let api: unknown;
  jest.isolateModules(() => {
    // `require` rather than `import`: the whole point is to re-evaluate the
    // module inside this callback, which a hoisted static import cannot do.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HttpApiClient } = require('../http') as typeof import('../http');
    api = new HttpApiClient('https://example.test/v1');
  });
  process.env = previous;
  return api as import('../http').HttpApiClient;
}

beforeEach(() => {
  captured.length = 0;
  logged.length = 0;
  jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
  respondWith(200, { items: [], nextCursor: null, hasMore: false });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('the environment under test has dev logging on at all', () => {
  /*
   * Every assertion below is inside an `if (!__DEV__) return`. If the flag were
   * false under Jest the whole file would pass while printing nothing, which is
   * the exact shape of a test suite that guards nothing.
   */
  expect(__DEV__).toBe(true);
});

test('a request body is printed before the round trip', async () => {
  /*
   * Before, not after. A request that hangs — the common case on a tunnel — never
   * reaches the response log, and that is precisely when "what did we send?" is
   * the question being asked.
   */
  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: undefined });
  await api.register({ email: 'ama@example.gh', password: 'pw-long-enough', displayName: 'Ama' });

  const sent = logged.findIndex((line) => line.includes('->'));
  const answered = logged.findIndex((line) => line.includes('200'));
  expect(sent).toBeGreaterThanOrEqual(0);
  expect(sent).toBeLessThan(answered);
  expect(logged[sent]).toContain('ama@example.gh');
});

test('credentials never reach the log', async () => {
  /*
   * A Metro log gets scrolled back through, screenshotted and pasted into
   * chats. A password in one of those is a credential leak with a long tail,
   * and the account most likely to be caught by it is the developer's own.
   */
  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: undefined });
  await api.register({
    email: 'ama@example.gh',
    password: 'correct-horse-battery',
    displayName: 'Ama',
  });

  expect(output()).not.toContain('correct-horse-battery');
  expect(output()).toContain('<redacted>');
});

test('a token in a response is redacted too', async () => {
  // The register call answers with a bearer token; printing the response body
  // wholesale would put it on screen just as surely as printing the password.
  respondWith(200, { accessToken: 'secret-bearer-value', refreshToken: 'r', expiresAt: 'x' });

  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: undefined });
  await api.register({ email: 'a@b.gh', password: 'pw-long-enough', displayName: 'Ama' });

  expect(output()).not.toContain('secret-bearer-value');
});

test('a failure prints the server request id on the status line', async () => {
  /*
   * The single most useful string in the whole log. A 500 is a number; the
   * request id is what lets the backend find this exact failure on their side,
   * and it is the reason the submission 500 could be reported precisely rather
   * than as "uploads are broken".
   *
   * Asserted *next to the code and message* rather than merely present
   * somewhere. The raw body is printed too, so a loose search for the id passes
   * even when the summary line has stopped carrying it — and the summary line
   * is the one that stays readable when the body is fifty lines of stack trace.
   */
  respondWith(500, {
    error: { code: 'INTERNAL', message: 'boom', requestId: 'f0a15a4bf1110a715af3ba1d73a07952' },
  });

  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: undefined });
  await expect(api.getFeed({ limit: 1 })).rejects.toThrow();

  expect(output()).toMatch(/INTERNAL: boom\s+\[f0a15a4bf1110a715af3ba1d73a07952\]/);
});

test('a multi-line server error is cut to its first line', async () => {
  // A Python traceback arrives as fifty lines. Fifty lines per failure buries
  // every other request, and the first line is the one that names the fault.
  respondWith(500, {
    error: {
      code: 'INTERNAL',
      message: 'ValueError: bad digest\n  File "app.py", line 41\n  File "db.py", line 9',
      requestId: 'abc123',
    },
  });

  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: '0' });
  await expect(api.getFeed({ limit: 1 })).rejects.toThrow();

  expect(output()).toMatch(/INTERNAL: ValueError: bad digest\s+\[abc123\]/);
});

test('a failure body is printed even with bodies switched off', async () => {
  /*
   * The switch exists to quieten healthy traffic, not to withhold the reason
   * for a failure. Somebody who turned bodies off to read a busy log and then
   * hit a 500 would otherwise be left with a bare number.
   */
  /*
   * The assertion deliberately targets a string that exists *only* in the body.
   * Asserting on the message would have been satisfied by the one-line summary
   * that prints beside it — so the test would have passed with the body path
   * removed entirely, which is what a probe proved it did.
   */
  respondWith(422, {
    error: { code: 'VALIDATION_FAILED', message: 'the report was rejected' },
    fieldErrors: { 'media.sha256': 'must be 64 hexadecimal characters' },
  });

  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: '0' });
  await expect(api.getFeed({ limit: 1 })).rejects.toThrow();

  expect(output()).toContain('64 hexadecimal characters');
});

test('switching bodies off quietens a healthy request', async () => {
  // Otherwise there would be no way to read a log during a feed scroll.
  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: '0' });
  await api.getFeed({ limit: 1 });

  expect(output()).toContain('200');
  expect(output()).not.toContain('hasMore');
});

test('a request that never answers still leaves a record', async () => {
  /*
   * The tunnel-dropped case. The outgoing line has already been printed, so the
   * pair reads as "we sent this, and nothing came back" rather than as silence.
   */
  global.fetch = (() => Promise.reject(new Error('Network request failed'))) as typeof fetch;

  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: undefined });
  await expect(api.getFeed({ limit: 1 })).rejects.toThrow();

  expect(output()).toContain('-> GET');
  expect(output()).toContain('FAILED');
});

test('a huge body is truncated rather than printed whole', async () => {
  /*
   * A feed page is tens of kilobytes. Printed in full it pushes every other
   * request off the screen, which turns the log from an inspector into noise.
   */
  respondWith(200, {
    items: Array.from({ length: 200 }, (_, i) => ({
      id: `incident-${i}`,
      description: 'x'.repeat(60),
    })),
    nextCursor: null,
    hasMore: false,
  });

  const api = await clientWith({ EXPO_PUBLIC_LOG_BODIES: undefined });
  await api.getFeed({ limit: 200 });

  expect(output()).toContain('… truncated');
  expect(output().length).toBeLessThan(4000);
});
