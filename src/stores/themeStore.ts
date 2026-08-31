import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';

/**
 * Which palette the app wears.
 *
 * **Dark is the default.** This app is used outdoors at night as often as at a
 * desk — a reporter filming a fire at 9pm should not be flashed by a white
 * screen — and every media surface is already dark, so a dark shell is the one
 * that does not fight the content.
 *
 * `system` is offered but is not the default. Most people never change the OS
 * setting, so defaulting to it would mean most people get light, which is not
 * the decision that was made.
 */

export type ThemeChoice = 'dark' | 'light' | 'system';

const KEY = 'dawuro.theme';

interface ThemeState {
  choice: ThemeChoice;
  /** False until the stored choice has been read. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setChoice: (choice: ThemeChoice) => void;
}

/**
 * Pushing to NativeWind is what actually repaints the app: every `bg-canvas`
 * and `text-text-primary` resolves through a CSS variable, so one call here
 * flips the entire interface without a component knowing about it.
 */
function apply(choice: ThemeChoice): void {
  colorScheme.set(choice);
}

export const useThemeStore = create<ThemeState>((set) => ({
  choice: 'dark',
  hydrated: false,

  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      const choice: ThemeChoice =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
      apply(choice);
      set({ choice, hydrated: true });
    } catch {
      // An unreadable keychain must not block launch, and must not leave the
      // app half-themed — fall back to the default rather than to nothing.
      apply('dark');
      set({ choice: 'dark', hydrated: true });
    }
  },

  setChoice: (choice) => {
    apply(choice);
    set({ choice });
    // Persisted after applying, so the change is instant even if the write is
    // slow or fails. A theme that lags the tap feels broken.
    void SecureStore.setItemAsync(KEY, choice).catch(() => undefined);
  },
}));

/** Dark by default, before anything has been read from storage. */
apply('dark');
