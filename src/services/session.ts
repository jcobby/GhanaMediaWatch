import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'gmw.accessToken';
const REFRESH_KEY = 'gmw.refreshToken';
const EXPIRY_KEY = 'gmw.tokenExpiresAt';
const KIND_KEY = 'gmw.tokenKind';

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  /** `device` when nobody has signed in on this phone. See `AuthTokens.kind`. */
  kind: 'device' | 'user';
}

/**
 * Token storage.
 *
 * SecureStore rather than AsyncStorage: these are bearer credentials, and on a
 * rooted or jailbroken device the difference between the keychain and a plain
 * JSON file is the whole security boundary.
 *
 * A device token and a user token occupy the same slot by design — signing in
 * upgrades the caller's identity in place, so the request layer never has to
 * choose between them. The *kind* is recorded alongside because the server
 * treats the two differently: `/me/*` is refused to a device token, and the app
 * has to be able to explain that as "sign in first" rather than as a
 * permissions failure.
 */
export const session = {
  /**
   * `kind` is optional here and defaults to `device`.
   *
   * Deliberately the cautious direction: an unlabelled token treated as a
   * device token offers a guest a sign-in they may not need, while the reverse
   * mistake hides a real permissions error behind sign-in advice that will
   * never resolve it. The two calls that mint a user token set it explicitly.
   */
  async save(s: Omit<StoredSession, 'kind'> & { kind?: StoredSession['kind'] }): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_KEY, s.accessToken);
    await SecureStore.setItemAsync(EXPIRY_KEY, s.expiresAt);
    await SecureStore.setItemAsync(KIND_KEY, s.kind ?? 'device');
    /*
     * Absent means gone, not unchanged.
     *
     * This only ever *wrote* a refresh token, so a session saved without one
     * inherited whichever token happened to be in the slot — a device session
     * could end up holding a signed-out user's refresh token, and a user
     * session could appear refreshable using a credential that belonged to a
     * different identity. Clearing it keeps the slot describing the session
     * actually stored.
     */
    if (s.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, s.refreshToken);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },

  async read(): Promise<StoredSession | null> {
    const accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
    if (!accessToken) return null;
    return {
      accessToken,
      refreshToken: await SecureStore.getItemAsync(REFRESH_KEY),
      expiresAt: (await SecureStore.getItemAsync(EXPIRY_KEY)) ?? '',
      // An install upgraded from a build that never wrote this key is holding a
      // device token: the signed-in case wrote a refresh token too, and the
      // anonymous one is by far the common state on a returning phone.
      kind: (await SecureStore.getItemAsync(KIND_KEY)) === 'user' ? 'user' : 'device',
    };
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(EXPIRY_KEY),
      SecureStore.deleteItemAsync(KIND_KEY),
    ]);
  },

  /** True when the stored token is gone or expires within the next minute. */
  isStale(s: StoredSession | null): boolean {
    if (!s) return true;
    if (!s.expiresAt) return false;
    const expiry = new Date(s.expiresAt).getTime();
    if (Number.isNaN(expiry)) return false;
    return expiry - Date.now() < 60_000;
  },
};
