import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'gmw.accessToken';
const REFRESH_KEY = 'gmw.refreshToken';
const EXPIRY_KEY = 'gmw.tokenExpiresAt';

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
}

/**
 * Token storage.
 *
 * SecureStore rather than AsyncStorage: these are bearer credentials, and on a
 * rooted or jailbroken device the difference between the keychain and a plain
 * JSON file is the whole security boundary.
 *
 * A device token and a user token occupy the same slot by design — signing in
 * upgrades the caller's identity in place, and the request layer does not need
 * to know which kind it is holding.
 */
export const session = {
  async save(s: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_KEY, s.accessToken);
    await SecureStore.setItemAsync(EXPIRY_KEY, s.expiresAt);
    if (s.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, s.refreshToken);
  },

  async read(): Promise<StoredSession | null> {
    const accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
    if (!accessToken) return null;
    return {
      accessToken,
      refreshToken: await SecureStore.getItemAsync(REFRESH_KEY),
      expiresAt: (await SecureStore.getItemAsync(EXPIRY_KEY)) ?? '',
    };
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(EXPIRY_KEY),
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
