import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'gmw.deviceId';

let cached: string | null = null;

/**
 * The app's primary device identifier.
 *
 * A UUID v4 generated on first launch and kept in the secure keychain. This is
 * the value attached to every submission, including anonymous ones — it is the
 * accountability mechanism the product depends on, and the anonymity explainer
 * in the UI says so plainly.
 *
 * It is never rendered in public UI.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  cached = fresh;
  return fresh;
}

/**
 * The platform's own identifier, as a secondary signal only.
 *
 * Both the Android ID and iOS identifierForVendor reset on uninstall or factory
 * reset, so they are useless as a primary key — they exist here purely to help
 * the backend correlate abuse across a reinstall.
 */
export async function getPlatformDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') return Application.getAndroidId();
    if (Platform.OS === 'ios') return await Application.getIosIdForVendorAsync();
    return null;
  } catch {
    return null;
  }
}
