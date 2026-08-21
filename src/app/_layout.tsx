import '@/../global.css';
import '@/i18n';

import { useEffect } from 'react';
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
import { ToastHost } from '@/components/ui';
import { colors } from '@/lib/theme';

// Hold the native splash until fonts resolve, so the first frame is never
// rendered in a fallback face that then reflows.
void SplashScreen.preventAutoHideAsync();

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
  }, []);

  useEffect(() => {
    // Registers an anonymous device identity so the very first feed request is
    // already authenticated. Failure is non-fatal: the screens surface it as a
    // designed error state rather than blocking launch behind the splash.
    void ensureSession().catch(() => undefined);
  }, []);

  useEffect(() => {
    // A font failure must not deadlock the app behind the splash screen —
    // RN falls back to the system face and the app stays usable.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary label="root">
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.canvas },
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
              <Stack.Screen name="surveys" />
            </Stack>
            <ToastHost />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
