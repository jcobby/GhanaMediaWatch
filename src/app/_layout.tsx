import '@/../global.css';
import '@/i18n';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ensureSession } from '@/api';
import { initialiseDatabase } from '@/db/client';
import { startSyncEngine, stopSyncEngine } from '@/services/sync';
import { registerUploader } from '@/services/uploader';
import { ensureMediaDirectory } from '@/services/media';
import { useOutboxStore } from '@/stores/outboxStore';
import { useAuthStore } from '@/stores/authStore';
import { registerForPushNotifications } from '@/services/pushNotifications';
import { ToastHost } from '@/components/ui';
import { BootScreen } from '@/components/BootScreen';
import { useColors } from '@/lib/theme';
import { queryClient } from '@/lib/queryClient';

// Hold the native splash until fonts resolve, so the first frame is never
// rendered in a fallback face that then reflows.
void SplashScreen.preventAutoHideAsync();

/** How long the boot screen may wait on the keychain before giving up on it. */
const BOOT_DEADLINE_MS = 4000;

/**
 * The shortest time the logo stays on screen.
 *
 * Without a floor the brand moment lasts as long as a keychain read — a
 * couple of hundred milliseconds on a warm start — which reads as a flicker
 * rather than as the app opening. Long enough to register the mark and the
 * words under it; short enough that nobody waits on it.
 */
const BOOT_MINIMUM_MS = 1500;

export default function RootLayout() {
  const c = useColors();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const accountId = useAuthStore((s) => s.profile?.id ?? null);

  /*
   * Push notifications, for whoever is signed in.
   *
   * Registered when an account appears — at sign-in, or on launch for somebody
   * already signed in — and again if a different account signs in on the same
   * phone. A guest is never registered: the token belongs to an account, and
   * the service refuses it for a device alone.
   */
  useEffect(() => {
    if (accountId) void registerForPushNotifications(accountId);
  }, [accountId]);
  /*
   * A deadline on the boot screen.
   *
   * `hydrate()` catches a rejected keychain read, but not a hung one — and a
   * promise that never settles would leave the app sitting on the logo with no
   * way forward. Launch has to be able to fail open: after this, the app
   * continues as a fresh install, which is exactly what the catch path does
   * anyway.
   */
  const [bootDeadlinePassed, setBootDeadlinePassed] = useState(false);
  const [bootMinimumElapsed, setBootMinimumElapsed] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // The schema must exist before anything reads the outbox, and the engine
    // must be running before the first connectivity change is missed.
    try {
      initialiseDatabase();
      ensureMediaDirectory();
      useOutboxStore.getState().refresh();
      // The uploader must be registered before the engine starts, or the first
      // drain runs against the placeholder that throws.
      registerUploader();
      startSyncEngine();
    } catch (cause) {
      console.error('[boot] local database unavailable', cause);
    }
    return () => stopSyncEngine();
  }, []);

  useEffect(() => {
    void useAuthStore.getState().hydrate();

    const deadline = setTimeout(() => setBootDeadlinePassed(true), BOOT_DEADLINE_MS);
    const minimum = setTimeout(() => setBootMinimumElapsed(true), BOOT_MINIMUM_MS);
    return () => {
      clearTimeout(deadline);
      clearTimeout(minimum);
    };
  }, []);

  useEffect(() => {
    // Registers an anonymous device identity so the very first feed request is
    // already authenticated. Failure is non-fatal: the screens surface it as a
    // designed error state rather than blocking launch behind the splash.
    void ensureSession().catch(() => undefined);
  }, []);

  const fontsSettled = fontsLoaded || fontError !== null;

  useEffect(() => {
    // Handed over to BootScreen rather than to the app itself: the native
    // splash goes as soon as fonts resolve, but the keychain read is still in
    // flight, and dropping straight into a signed-out shell that corrects
    // itself a moment later is worse than one more beat on the logo.
    //
    // A font failure must not deadlock the app behind the splash — RN falls
    // back to the system face and the app stays usable.
    if (fontsSettled) void SplashScreen.hideAsync();
  }, [fontsSettled]);

  /*
   * Both gates, not just fonts.
   *
   * Text rendered in a fallback face reflows when Inter arrives, and a screen
   * built before the profile is read flashes the signed-out state. Waiting for
   * both means the first frame the user sees is the real one.
   */
  /*
   * Ready, and seen.
   *
   * The two gates answer different questions. Fonts and the profile decide
   * whether the app *can* render correctly; the minimum decides whether anyone
   * actually saw whose app it is. Both have to pass.
   */
  const ready = fontsSettled && (authHydrated || bootDeadlinePassed);
  if (!ready || !bootMinimumElapsed) return <BootScreen />;

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary label="root">
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.canvas },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              {/* Presented as a card over the tabs so the feed stays mounted
                behind it and returns to the same scroll position. */}
              <Stack.Screen name="incident/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="capture/review" options={{ presentation: 'card' }} />
              {/*
                A folder is only a single screen when it has its own `_layout`.
                `surveys` does; `organisations` and `earnings` do not, so their
                routes are named file by file.

                Getting this wrong is a warning at startup and nothing else —
                the screen still opens, because the router falls back to its own
                inferred route. It stays wrong until somebody reads the log.

                No organisation or platform shells: that work is done in the web
                console, and the phone no longer has screens for it.
              */}
              <Stack.Screen name="earnings/index" />
              <Stack.Screen name="organisations/index" />
              <Stack.Screen name="organisations/[id]" />
              <Stack.Screen name="surveys" />
            </Stack>
            <ToastHost />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
