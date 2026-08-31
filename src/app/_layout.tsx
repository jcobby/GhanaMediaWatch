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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ensureSession } from '@/api';
import { initialiseDatabase } from '@/db/client';
import { startSyncEngine, stopSyncEngine } from '@/services/sync';
import { registerUploader } from '@/services/uploader';
import { ensureMediaDirectory } from '@/services/media';
import { useOutboxStore } from '@/stores/outboxStore';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { ToastHost } from '@/components/ui';
import { BootScreen } from '@/components/BootScreen';
import { useColors, useIsDark } from '@/lib/theme';

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

/**
 * One client for the app's lifetime.
 *
 * Retries are capped at two: on a flaky mobile connection an aggressive retry
 * policy turns one failed screen into thirty seconds of silent spinning, which
 * reads as a hang. Two attempts, then show the designed error state.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const c = useColors();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const isDark = useIsDark();
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
    // The stored theme is read alongside the profile, so the first painted
    // frame is already the right one. Reading it later would flash the
    // default palette at anyone who chose the other.
    void useThemeStore.getState().hydrate();
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
            <StatusBar style={isDark ? 'light' : 'dark'} />
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
              <Stack.Screen name="org" />
              <Stack.Screen name="platform" />
              <Stack.Screen name="earnings" />
              <Stack.Screen name="business" />
              <Stack.Screen name="businesses" />
              <Stack.Screen name="surveys" />
            </Stack>
            <ToastHost />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
