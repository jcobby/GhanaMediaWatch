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
 * **Shown in development whether or not it is configured; in a release build
 * only when it is.**
 *
 * The client ids are created per app in the Google console and live in the
 * environment, so on a build without them the picker fails on an empty
 * audience. Shipping that to a reporter is a feature that lies — they cannot
 * tell it from their account being refused, so a release build hides it.
 *
 * Hiding it in development was the wrong half of that trade, and it cost a
 * round trip: the button was built, placed on three screens, and invisible on
 * the only device anyone was looking at. There was no way to tell "not built"
 * from "not configured". So in development it is always on screen, and tapping
 * it unconfigured says exactly which variable is missing.
 */
export function GoogleButton({
  onDone,
  first = false,
}: {
  onDone?: () => void;
  /**
   * Offered before the form rather than after it.
   *
   * Moves the rule below the button instead of above, because the word "or"
   * only reads as a choice when there is something on both sides of it — at the
   * top of a screen with the divider first, it is a rule with nothing above it
   * and a button that looks like the answer to a question nobody asked.
   */
  first?: boolean;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signInWithGoogle);
  const [busy, setBusy] = useState(false);

  if (!isGoogleConfigured && !__DEV__) return null;

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
              : cause.reason === 'not_configured'
                ? // Only reachable in development, where the button is shown
                  // regardless. Names the variable, because "not configured" on
                  // its own sends you looking through the wrong files.
                  t('auth.googleNotConfigured')
                : t('auth.googleNoToken')
          : cause instanceof Error
            ? cause.message
            : t('common.unknownErrorHelp');
      toast.error(t('auth.googleFailed'), body);
    } finally {
      setBusy(false);
    }
  };

  /* A rule with the word in it, so the button on the other side of it reads as
     the other way in rather than as another step of the form. */
  const divider = (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-hairline/[0.12]" />
      <Text variant="caption" tone="faint">
        {t('auth.or')}
      </Text>
      <View className="h-px flex-1 bg-hairline/[0.12]" />
    </View>
  );

  return (
    <View className="gap-3">
      {first ? null : divider}
      <Button
        label={t('auth.continueWithGoogle')}
        variant="glass"
        size="lg"
        fullWidth
        loading={busy}
        onPress={() => void run()}
        leading={<Ionicons name="logo-google" size={18} color={c.textPrimary} />}
      />
      {first ? divider : null}
      {/*
        Said at a glance, not only on tap, and only in development. Otherwise
        the button looks finished and the missing configuration is a surprise
        held until somebody presses it.
      */}
      {!isGoogleConfigured ? (
        <Text variant="caption" tone="warning" className="text-center">
          {t('auth.googleNotConfigured')}
        </Text>
      ) : null}
    </View>
  );
}
