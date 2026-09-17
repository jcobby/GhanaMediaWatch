import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * Launch router.
 *
 * The phone is the reporter's app: the feed, capture, earnings and their own
 * reports. Organisation and platform work — the inbox, routing, payouts,
 * applications — is done in the web console, where it has the room it needs, so
 * every account lands in the same place here.
 *
 * Renders nothing until the keychain is read, so a returning user never sees a
 * frame of onboarding before being sent on.
 */
export default function IndexRoute() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const onboarded = useAuthStore((s) => s.onboarded);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(onboarded ? '/(tabs)' : '/(auth)/onboarding');
  }, [hydrated, onboarded, router]);

  return <View className="flex-1 bg-canvas" />;
}
