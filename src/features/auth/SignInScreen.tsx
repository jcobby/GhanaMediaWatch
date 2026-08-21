import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Pressable, Text } from '@/components/ui';
import { accentGradient, colors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { AuthField } from './AuthField';
import { DemoAccountSheet } from './DemoAccountSheet';
import { isLiveBackend } from '@/api';
import { signInSchema, type SignInValues } from './schemas';
import { DEMO_PASSWORD } from '@/api/dawuroData';

export function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((s) => s.signIn);
  const [submitting, setSubmitting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const { control, handleSubmit, formState, setValue } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    // Validate on blur rather than on every keystroke — errors appearing while
    // someone is still typing their email read as hostile.
    mode: 'onBlur',
  });

  const onSubmit = async (values: SignInValues) => {
    setSubmitting(true);
    try {
      await signIn(values.email);
      // The store now knows the account type, so land in its shell rather than
      // bouncing the user through the reporter feed first.
      const { profile } = useAuthStore.getState();
      router.replace(
        profile?.accountType === 'platform_owner'
          ? '/platform/(tabs)'
          : profile?.accountType === 'business'
            ? '/business/(tabs)'
            : '/(tabs)',
      );
    } catch (cause) {
      toast.error(
        t('auth.signInFailed'),
        cause instanceof Error ? cause.message : t('common.unknownErrorHelp'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
        contentContainerClassName="gap-6 px-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-4">
          <LinearGradient
            colors={[...accentGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="shield-checkmark" size={30} color={colors.textOnDark} />
          </LinearGradient>
          <View className="gap-1.5">
            <Text variant="display-md" className="text-center">
              {t('auth.welcomeBack')}
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              {t('auth.signInSubtitle')}
            </Text>
          </View>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                label={t('auth.email')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.email?.message}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                label={t('auth.password')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.password?.message}
                placeholder="Your password"
                secure
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
              />
            )}
          />
          <Pressable
            onPress={() => router.push('/(auth)/forgot-password')}
            haptic={false}
            accessibilityLabel={t('auth.forgotPassword')}
            className="self-end"
          >
            <Text variant="body-sm" tone="accent" className="font-sans-semibold">
              {t('auth.forgotPassword')}
            </Text>
          </Pressable>
        </View>

        <View className="gap-3">
          <Button
            label={t('auth.signIn')}
            size="lg"
            fullWidth
            loading={submitting}
            onPress={handleSubmit(onSubmit)}
          />
          {/* Reporting must never require an account — that is the whole point
              of an anonymous reporting app. */}
          <Button
            label={t('onboarding.continueWithout')}
            variant="glass"
            fullWidth
            onPress={() => router.replace('/(tabs)')}
          />
        </View>

        {/* Only while the app runs on fixtures. A shortcut into a business or
            operator account must not exist against a real backend. */}
        {!isLiveBackend ? (
          <Pressable
            onPress={() => setDemoOpen(true)}
            haptic={false}
            accessibilityLabel={t('auth.useDemoAccount')}
            className="flex-row items-center justify-center gap-1.5"
          >
            <Ionicons name="flask-outline" size={14} color={colors.accent} />
            <Text variant="body-sm" tone="accent" className="font-sans-semibold">
              {t('auth.useDemoAccount')}
            </Text>
          </Pressable>
        ) : null}

        <View className="flex-row items-center justify-center gap-1.5">
          <Text variant="body-sm" tone="muted">
            {t('auth.noAccount')}
          </Text>
          <Pressable
            onPress={() => router.push('/(auth)/sign-up')}
            haptic={false}
            accessibilityLabel={t('auth.signUp')}
          >
            <Text variant="body-sm" tone="accent" className="font-sans-semibold">
              {t('auth.signUp')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <DemoAccountSheet
        visible={demoOpen}
        onClose={() => setDemoOpen(false)}
        onPick={(login) => {
          setDemoOpen(false);
          setValue('email', login.email);
          setValue('password', DEMO_PASSWORD);
          void onSubmit({ email: login.email, password: DEMO_PASSWORD });
        }}
      />
    </KeyboardAvoidingView>
  );
}
