import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { isGoogleConfigured, GoogleSignInUnavailable } from '@/services/googleSignIn';
import { homeRouteFor } from '@/lib/homeRoute';
import { useColors } from '@/lib/theme';
import { hapticUnlock } from '@/lib/haptics';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';

/**
 * "Continue with Google" — the same control on every auth screen.
 *
 * One button for signing in *and* registering, because the service makes no
 * distinction: `/auth/google` creates the account when the address is new and
 * signs it in when it is not. Two buttons would be a choice nobody can answer
 * correctly about an account they may or may not already have.
 *
 * **Renders nothing when Google is not configured.** The client ids are created
 * per app in the Google console and live in the environment, so on a build
 * without them this button would open a picker and fail on an empty audience —
 * and the person has no way to tell that from their account being refused. A
 * missing button is a feature that is not offered; a broken one is a feature
 * that is lying.
 */
export function GoogleButton({ onDone }: { onDone?: () => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signInWithGoogle);
  const [busy, setBusy] = useState(false);

  if (!isGoogleConfigured) return null;

  const run = async () => {
    setBusy(true);
    try {
      const signedIn = await signIn();
      /*
       * Dismissed the picker. Silence is the right response — a toast saying
       * sign-in failed after somebody deliberately backed out is the app
       * arguing with them.
       */
      if (!signedIn) return;

      const { profile } = useAuthStore.getState();
      hapticUnlock();
      toast.success(
        t('auth.welcomeBackTitle'),
        t('auth.welcomeBackBody', {
          name: profile?.orgName ?? profile?.displayName ?? '',
        }),
      );
      onDone?.();
      router.replace(homeRouteFor(profile ?? null));
    } catch (cause) {
      /*
       * The two a person can act on get their own words. Everything else is the
       * service's failure and carries the service's message.
       */
      const body =
        cause instanceof GoogleSignInUnavailable
          ? cause.reason === 'play_services'
            ? t('auth.googlePlayServices')
            : cause.reason === 'unavailable'
              ? // The native module is not in this binary — Expo Go, or a
                // development build made before the package was added.
                t('auth.googleUnavailable')
              : t('auth.googleNoToken')
          : cause instanceof Error
            ? cause.message
            : t('common.unknownErrorHelp');
      toast.error(t('auth.googleFailed'), body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      {/* A rule with the word in it, so the button below reads as the other way
          in rather than as another step of the form above. */}
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-hairline/[0.12]" />
        <Text variant="caption" tone="faint">
          {t('auth.or')}
        </Text>
        <View className="h-px flex-1 bg-hairline/[0.12]" />
      </View>
      <Button
        label={t('auth.continueWithGoogle')}
        variant="glass"
        size="lg"
        fullWidth
        loading={busy}
        onPress={() => void run()}
        leading={<Ionicons name="logo-google" size={18} color={c.textPrimary} />}
      />
    </View>
  );
}
