import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { accentGradient, useColors } from '@/lib/theme';
import { GoogleButton } from './GoogleButton';

/**
 * The fork: create an account, sign in, or neither.
 *
 * The introduction used to end on the sign-in screen, which is the wrong door
 * for the person it lands on. Somebody who has just been told what the app does
 * has no account yet — they were shown a password field and a small "Don't have
 * an account?" line under it, and creating one was the harder of the two paths
 * when it should have been the obvious one.
 *
 * Three ways on, in the order they are wanted:
 *
 *   **Create an account** — first, because it is what most arrivals need, and
 *   because it is the door to both kinds of account. Whether you are a person
 *   with a phone or an institution applying to join is asked on the next screen,
 *   where the form can change shape around the answer.
 *
 *   **Sign in** — for the returning half.
 *
 *   **Continue without an account** — last but never removed. Reporting must
 *   not require an account; that is the whole premise of an anonymous reporting
 *   app, and a wall here would be the app contradicting its own introduction.
 */
export function WelcomeScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 justify-between bg-canvas px-6"
      style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}
    >
      <View className="items-center gap-5">
        <LinearGradient
          colors={[...accentGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 84,
            height: 84,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="megaphone" size={38} color={c.textOnDark} />
        </LinearGradient>
        <View className="items-center gap-2">
          <Text variant="display-md" className="text-center">
            {t('common.appName')}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {t('auth.welcomeSubtitle')}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <Button
          label={t('auth.createAccount')}
          size="lg"
          fullWidth
          onPress={() => router.push('/(auth)/sign-up')}
        />
        <Button
          label={t('auth.signIn')}
          variant="glass"
          size="lg"
          fullWidth
          onPress={() => router.push('/(auth)/sign-in')}
        />
        {/* One button for both: the service creates the account if the address
            is new and signs it in if it is not. */}
        <GoogleButton />
        {/*
          Reporting must never require an account. Kept as a plain text button
          rather than a third filled one, so it reads as the way past rather
          than as a third thing to weigh up.
        */}
        <Button
          label={t('onboarding.continueWithout')}
          variant="ghost"
          size="lg"
          fullWidth
          onPress={() => router.replace('/(tabs)')}
        />
        <Text variant="caption" tone="faint" className="px-2 text-center">
          {t('auth.welcomeGuestNote')}
        </Text>
      </View>
    </View>
  );
}
