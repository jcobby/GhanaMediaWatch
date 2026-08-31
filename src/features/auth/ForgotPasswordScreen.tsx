import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { AuthField } from './AuthField';
import { forgotPasswordSchema, type ForgotPasswordValues } from './schemas';

export function ForgotPasswordScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      // No reset endpoint exists yet — flagged in API_CONTRACT.md. The screen
      // is built so wiring it later is a one-line change.
      await new Promise((resolve) => setTimeout(resolve, 600));
      setSent(true);
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
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
        contentContainerClassName="gap-6 px-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <Text variant="title-lg">{t('auth.resetPassword')}</Text>
        </View>

        {sent ? (
          <View className="gap-4">
            <Glass elevation="low" className="flex-row items-start gap-3 rounded-lg p-4">
              <Ionicons name="mail-outline" size={20} color={c.success} />
              <View className="flex-1 gap-1">
                <Text variant="body" className="font-sans-semibold">
                  {t('auth.resetSentTitle')}
                </Text>
                {/*
                 * Deliberately does not confirm whether the address exists.
                 * A message that differs for known and unknown emails turns the
                 * reset form into an account-enumeration tool — which for an
                 * app used by anonymous reporters is a real safety problem.
                 */}
                <Text variant="body-sm" tone="muted">
                  {t('auth.resetSentBody')}
                </Text>
              </View>
            </Glass>
            <Button label={t('auth.backToSignIn')} fullWidth onPress={() => router.back()} />
          </View>
        ) : (
          <View className="gap-5">
            <Text variant="body" tone="muted">
              {t('auth.resetSubtitle')}
            </Text>
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
                />
              )}
            />
            <Button
              label={t('auth.sendResetLink')}
              size="lg"
              fullWidth
              loading={submitting}
              onPress={handleSubmit(onSubmit)}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
