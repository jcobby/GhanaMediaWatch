import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api, isLiveBackend } from '@/api';

/**
 * Register this phone for push notifications, for the signed-in account.
 *
 * Nothing did this before, so the service had no way to tell a reporter that
 * their report was verified, licensed, or paid for — the moments that decide
 * whether somebody files a second one.
 *
 * **Quiet when it cannot work.** `PUT /me/push-token` is for an account, so a
 * guest is never registered. A simulator has no push token, and Expo Go cannot
 * receive remote notifications, so both are skipped rather than prompting for a
 * permission that leads nowhere. A refusal, or a failure to reach the service,
 * is not an error the reporter needs to see: notifications are a convenience,
 * and the report itself is unaffected.
 *
 * The native token is sent (`getDevicePushTokenAsync`) because the service
 * delivers through Firebase Cloud Messaging, not through Expo's push service.
 */

/** The account and token last registered, so the same pair is not sent twice. */
let registered: string | null = null;

/**
 * @param accountId who is signed in. Part of what makes a registration unique,
 *   so a second account signing in on the same phone registers the token for
 *   itself rather than being skipped as already done.
 */
export async function registerForPushNotifications(accountId: string): Promise<void> {
  if (!isLiveBackend || !Device.isDevice) return;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;

  try {
    if (Platform.OS === 'android') {
      // The channel named in app.json, so alerts arrive with the right importance.
      await Notifications.setNotificationChannelAsync('incident-alerts', {
        name: 'Incident alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const token = await Notifications.getDevicePushTokenAsync();
    const value = typeof token.data === 'string' ? token.data : JSON.stringify(token.data);
    if (!value) return;

    const key = `${accountId}:${value}`;
    if (key === registered) return;

    await api.registerPushToken(value);
    registered = key;
  } catch {
    // Not fatal. The next sign-in or launch tries again.
  }
}
