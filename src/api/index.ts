import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ApiClient } from './client';
import { HttpApiClient } from './http';
import { MockApiClient } from './mock';
import { getDeviceId, getPlatformDeviceId } from '@/services/deviceIdentity';
import { session } from '@/services/session';

export * from './client';

const MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'mock';
const RAW_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/** Trailing slashes produce `//v1` paths against some gateways. */
const baseUrl = `${RAW_URL.replace(/\/+$/, '')}/v1`;

/**
 * The client every screen uses.
 *
 * Chosen once at module load from a single env var, so nothing downstream needs
 * to know whether it is talking to a real server or to fixtures.
 */
export const api: ApiClient =
  MODE === 'http' && RAW_URL ? new HttpApiClient(baseUrl) : new MockApiClient();

export const isLiveBackend = MODE === 'http' && Boolean(RAW_URL);

/**
 * Ensures the app holds a usable token before the first authenticated request.
 *
 * The backend requires auth even on the public feed, so a cold launch must
 * register the device first. Called once from the root layout; safe to call
 * again, since it no-ops when the stored token is still fresh.
 */
export async function ensureSession(): Promise<void> {
  if (!isLiveBackend) return;

  const existing = await session.read();
  if (!session.isStale(existing)) return;

  const tokens = await api.registerDevice({
    deviceId: await getDeviceId(),
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    platformDeviceId: await getPlatformDeviceId(),
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    buildNumber: 1,
  });

  await session.save(tokens);
}
