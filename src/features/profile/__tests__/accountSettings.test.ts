import fs from 'fs';
import path from 'path';

/**
 * A reporter can manage their own account.
 *
 * None of this existed: no way to correct a name, change a password, or delete
 * an account — and signing out cleared the phone while leaving the refresh token
 * valid on the service.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('each action calls the documented endpoint', () => {
  const http = code('api/http.ts');
  expect(http).toMatch(/'\/auth\/logout', \{\s*method: 'POST',\s*body: \{ refreshToken \}/);
  expect(http).toMatch(/'\/me', \{ method: 'PATCH', body: \{ displayName: input\.displayName \} \}/);
  expect(http).toMatch(/'\/me\/password', \{\s*method: 'PUT'/);
  expect(http).toMatch(/'\/me', \{ method: 'DELETE' \}/);
});

test('signing out revokes the refresh token, and still signs out if that fails', () => {
  const store = code('stores/authStore.ts');
  const signOut = store.slice(store.indexOf('signOut: async'), store.indexOf('updateDisplayName: async'));
  expect(signOut).toMatch(/api\.logout\(stored\.refreshToken\)\.catch\(/);
  expect(signOut.indexOf('api.logout')).toBeLessThan(signOut.indexOf('session.clear()'));
});

test('a deleted account is cleared from the phone only once the service agrees', () => {
  const store = code('stores/authStore.ts');
  const del = store.slice(store.indexOf('deleteAccount: async'));
  expect(del.indexOf('api.deleteAccount()')).toBeLessThan(del.indexOf('session.clear()'));
});

test('the settings tab offers it, and only to an account', () => {
  expect(code('features/profile/ProfileScreen.tsx')).toMatch(/<AccountSettings \/>/);
  const settings = code('features/profile/AccountSettings.tsx');
  expect(settings).toMatch(/if \(!profile\) return null;/);
  // Deleting is confirmed, and destructive.
  expect(settings).toMatch(/style: 'destructive'/);
});

test('the new password follows the same rule as sign-up', () => {
  expect(code('features/profile/AccountSettings.tsx')).toMatch(/passwordSchema\.safeParse\(newPassword\)/);
});
