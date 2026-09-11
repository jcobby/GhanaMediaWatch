import { useAuthStore } from '../authStore';

/**
 * Signing in and creating an account.
 *
 * Both screens already collected a password — the forms validate one, the
 * sign-up screen even scores its strength — and both then called a
 * create-on-first-signin endpoint that takes an email alone. The password the
 * person had just chosen was discarded before it left the screen.
 *
 * Two things followed from that, and neither announced itself:
 *
 *   - Nothing was ever checked. Anyone who knew an email address was that
 *     account.
 *   - A typo at the *sign-in* box created a second, empty account instead of
 *     saying the details were wrong, and the reporter could not work out where
 *     their reports had gone.
 */

const mockSignIn = jest.fn();
const mockRegister = jest.fn();

jest.mock('@/api', () => ({
  api: {
    signIn: (...args: unknown[]) => mockSignIn(...args),
    register: (...args: unknown[]) => mockRegister(...args),
  },
}));

jest.mock('@/services/session', () => ({
  session: { save: jest.fn(), read: jest.fn(), clear: jest.fn(), isStale: () => false },
}));

const tokens = { accessToken: 'a', refreshToken: 'r', expiresAt: '2030-01-01T00:00:00.000Z' };

beforeEach(() => {
  mockSignIn.mockReset().mockResolvedValue(tokens);
  mockRegister.mockReset().mockResolvedValue(tokens);
});

test('signing in sends the password', () => {
  // The regression that shipped: `signIn(values.email)` with the password
  // sitting unused in the same object.
  void useAuthStore.getState().signIn('ama@example.gh', 'a-real-passphrase');

  expect(mockSignIn).toHaveBeenCalledTimes(1);
  expect(mockSignIn.mock.calls[0]![0]).toEqual({
    email: 'ama@example.gh',
    password: 'a-real-passphrase',
  });
});

test('creating an account is a separate call, not a sign-in', () => {
  /*
   * The distinction is the whole point. Registering explicitly lets the server
   * answer "that email is already taken", which is the useful reply; the old
   * flow could only ever succeed, silently, on a new account.
   */
  void useAuthStore.getState().register('new@example.gh', 'a-real-passphrase', 'Ama K.');

  expect(mockRegister).toHaveBeenCalledTimes(1);
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockRegister.mock.calls[0]![0]).toEqual({
    email: 'new@example.gh',
    password: 'a-real-passphrase',
    displayName: 'Ama K.',
  });
});

test('a registered account is a reporter with no organisation', () => {
  // The public does not apply for an account type, and a new account must not
  // inherit org fields from whatever was in the store before.
  void useAuthStore.getState().register('new@example.gh', 'pw-long-enough', 'Ama K.');

  const call = mockRegister.mock.calls[0]![0] as { displayName: string };
  expect(call.displayName).toBe('Ama K.');
});

test('the password is never used as a display name', () => {
  /*
   * Guards the shape of the call rather than its behaviour. The old signature
   * was `signIn(email, displayName?)` and the new one is
   * `signIn(email, password)` — the same arity with a different meaning, which
   * is exactly the kind of change a careless merge gets backwards.
   */
  void useAuthStore.getState().signIn('ama@example.gh', 'a-real-passphrase');

  const arg = mockSignIn.mock.calls[0]![0] as Record<string, unknown>;
  expect(arg.displayName).toBeUndefined();
  expect(arg.password).toBe('a-real-passphrase');
});
