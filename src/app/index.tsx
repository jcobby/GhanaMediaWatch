import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { ORGANISATION_TIER_ENABLED } from '@/lib/features';

/**
 * Launch router.
 *
 * Sends each account type to its own shell. The three roles do unrelated work,
 * and dropping a platform operator into a video feed — or an agency officer
 * into a capture screen — makes both feel like the app was built for someone
 * else.
 *
 * Renders nothing until the keychain is read, so a returning user never sees a
 * frame of the wrong experience before being redirected.
 */
export default function IndexRoute() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const onboarded = useAuthStore((s) => s.onboarded);
  const accountType = useAuthStore((s) => s.profile?.accountType);

  useEffect(() => {
    if (!hydrated) return;
    if (!onboarded) {
      router.replace('/(auth)/onboarding');
      return;
    }
    if (accountType === 'platform_owner') {
      router.replace('/platform/(tabs)');
      return;
    }
    // The institution tier is console work; on the phone an organisation account is
    // still a person who can read the feed and file a report.
    if (ORGANISATION_TIER_ENABLED && accountType === 'organisation') {
      router.replace('/organisation/(tabs)');
      return;
    }
    router.replace('/(tabs)');
  }, [hydrated, onboarded, accountType, router]);

  return <View className="flex-1 bg-canvas" />;
}
