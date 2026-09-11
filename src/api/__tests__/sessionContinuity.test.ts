import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * Signing in must not quietly become signing out.
 *
 * `ensureToken` registered a **device** whenever the stored token was stale —
 * including for somebody who had signed in. Their account became a guest
 * without a word: the profile stayed in secure storage so the screen kept
 * showing their name and email, while `/me/*` started answering 403. What a
 * signed-in reporter saw was their own account, their own email, and
 * underneath it "Create an account to see this".
 *
 * Two things have to hold. A signed-in session is *refreshed* rather than
 * replaced; and when it genuinely cannot be recovered, the profile goes with
 * it, so the screen and the token never disagree about who is here.
 */

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Just `ensureToken`, so ordering assertions cannot drift into other methods. */
function ensureTokenBody(): string {
  const src = read('api/http.ts').replace(/\r\n/g, '\n');
  const start = src.indexOf('private async ensureToken');
  const end = src.indexOf('private async request', start);
  return src.slice(start, end);
}

test('the slice under test is really ensureToken', () => {
  // A rename would otherwise empty every assertion below.
  const body = ensureTokenBody();
  expect(body).toContain('ensureToken');
  expect(body).toContain('registerDevice');
  expect(body.length).toBeGreaterThan(300);
});

test('a signed-in session is refreshed, not replaced', () => {
  const body = ensureTokenBody();
  expect(body).toMatch(/kind === 'user' && stored\.refreshToken/);
  expect(body).toMatch(/this\.refresh\(stored\.refreshToken\)/);
});

test('the refresh is attempted before any device registration', () => {
  /*
   * Ordering is the whole fix. Registering first and refreshing after would
   * have already overwritten the session by the time the refresh ran.
   */
  const body = ensureTokenBody();
  expect(body).toContain("kind === 'user'");
  expect(body).toContain('registerDevice');
  expect(body.indexOf("kind === 'user'")).toBeLessThan(body.indexOf('registerDevice'));
});

test('a failed refresh signs the person out rather than demoting them', () => {
  /*
   * The subtle half. Falling through to `registerDevice` after a rejected
   * refresh reinstates the original bug exactly — a guest token, a stale
   * profile, and a 403 nobody can explain.
   */
  const body = ensureTokenBody();
  const failure = body.slice(body.indexOf('} catch {'));
  expect(failure).toMatch(/session\.clear\(\)/);
  expect(failure).toMatch(/onSignedOut\?\.\(\)/);
  expect(failure).toMatch(/return;/);
});

test('the replay path does not demote a signed-in caller either', () => {
  /*
   * The 401 handler cleared the session and let `ensureToken` register a
   * device — the same demotion by a different route.
   */
  const src = read('api/http.ts');
  const replay = src.slice(src.indexOf('A rejected token is recoverable'));
  expect(replay).toMatch(/held\?\.kind === 'user' && held\.refreshToken/);
  expect(replay).toMatch(/this\.refresh\(held\.refreshToken\)/);
});

test('the profile is dropped with the session', () => {
  /*
   * The client owns the token, the store owns the profile. If only one is
   * cleared they disagree, and the screen keeps showing an account that no
   * longer has a session behind it.
   */
  const store = read('stores/authStore.ts');
  expect(store).toMatch(/forceSignedOut: async \(\)/);
  const handler = store.slice(store.indexOf('forceSignedOut: async ()'));
  expect(handler).toMatch(/deleteItemAsync\(PROFILE_KEY\)/);
  expect(handler).toMatch(/set\(\{ profile: null \}\)/);
  expect(store).toMatch(/setOnSignedOut\(/);
});

test('being signed out is announced', () => {
  /*
   * A screen that silently empties reads as data loss. This is somebody's
   * account ending mid-session; they need to know why, and that their queued
   * reports are unaffected.
   */
  const auth = en.auth as unknown as Record<string, string>;
  expect(Boolean(auth.sessionEndedTitle)).toBe(true);
  expect(auth.sessionEndedBody).toMatch(/queued|still sends/i);
});

// ─── the identity goes with the session ────────────────────────────────────

test('losing a session signs the person out, rather than half of them', () => {
  /*
   * The reported symptom: reopening the app showed the reporter's own name and
   * email directly above "Create an account to see this".
   *
   * The 401 replay path cleared the credential when there was no refresh token
   * to use, and stopped there. The profile stayed in secure storage, the next
   * request registered a *device*, and `/me/*` began correctly refusing a
   * guest — so the phone showed a signed-in identity over a guest session.
   *
   * Clearing a session without clearing whose it was is the bug. Every path
   * that demotes a user to a device has to say so.
   */
  const src = fs.readFileSync(path.resolve(__dirname, '../http.ts'), 'utf8');

  const replay = src.slice(src.indexOf('const held = await session.read();'));
  const elseBranch = replay.slice(
    replay.indexOf('} else {'),
    replay.indexOf('return this.request'),
  );
  expect(elseBranch).toContain('await session.clear()');
  expect(elseBranch).toMatch(/onSignedOut\?\.\(\)/);
});

test('becoming a guest clears the signed-in profile', () => {
  /*
   * The other route to the same screen: `ensureToken` falling through to a
   * device registration for a session that was a user's.
   */
  const src = fs.readFileSync(path.resolve(__dirname, '../http.ts'), 'utf8');
  const ensure = src.slice(
    src.indexOf('private async ensureToken'),
    src.indexOf('this.pendingAuth = null'),
  );
  const registration = ensure.slice(
    ensure.indexOf('const tokens = await this.registerDevice') - 400,
  );
  expect(registration).toMatch(/stored\?\.kind === 'user'.*onSignedOut/s);
});

test('a saved session never inherits a refresh token', () => {
  /*
   * `save` only ever wrote the refresh token, so a session stored without one
   * kept whatever was in the slot — a device session could hold a signed-out
   * user's refresh token, and a user session could look refreshable with a
   * credential belonging to a different identity.
   */
  const src = fs.readFileSync(path.resolve(__dirname, '../../services/session.ts'), 'utf8');
  expect(src).toMatch(/else await SecureStore\.deleteItemAsync\(REFRESH_KEY\)/);
});
