import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { homeRouteFor } from '@/lib/homeRoute';

/**
 * Launch router.
 *
 * Two experiences, decided by what the *server* said this account is. A plain
 * account is a reporter and lands in the reporter app — the feed, capture,
 * earnings, their own reports. An account the service placed in an organisation
 * lands in the organisation's app: the routed inbox, its licences, its
 * dispatches.
 *
 * Platform-operator work is still not here. Routing, payouts and applications
 * are a desk job with tables in them, and they stay in the web console.
 *
 * Renders nothing until the keychain is read, so a returning user never sees a
 * frame of onboarding — or of the wrong app — before being sent on.
 */
export default function IndexRoute() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const onboarded = useAuthStore((s) => s.onboarded);
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(onboarded ? homeRouteFor(profile) : '/(auth)/onboarding');
  }, [hydrated, onboarded, profile, router]);

  return <View className="flex-1 bg-canvas" />;
}
