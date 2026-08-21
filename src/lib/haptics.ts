import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics wrappers that no-op on web and never reject.
 *
 * Feedback is fire-and-forget UI garnish: a failed haptic (unsupported device,
 * silent mode, permission quirk) must never surface as an error or interrupt
 * the action that triggered it.
 */
const safe = (fn: () => Promise<void>): void => {
  if (Platform.OS === 'web') return;
  void fn().catch(() => {
    /* haptics are non-essential; a failure here is not user-visible */
  });
};

/** Primary action confirmed — buttons, shutter press. */
export const hapticPress = (): void =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** A state gate opened — e.g. GPS accuracy reached, camera unlocked. */
export const hapticUnlock = (): void =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Something the user should notice but that is not an error. */
export const hapticWarning = (): void =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** An action failed. */
export const hapticError = (): void =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** Discrete selection change — segmented controls, pickers, toggles. */
export const hapticSelect = (): void => safe(() => Haptics.selectionAsync());

/** Recording started/stopped — heavier than a tap. */
export const hapticRecord = (): void =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
