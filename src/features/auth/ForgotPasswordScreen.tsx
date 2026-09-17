import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Text } from '@/components/ui';
import { api } from '@/api';
import { describeApiError } from '@/lib/apiErrorCopy';
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
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null);

  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  /*
   * Sent to the service now.
   *
   * This waited 600ms and said "check your email" without sending anything, so
   * a reporter locked out of their account waited for an email that was never
   * going to arrive. `POST /auth/password/forgot` answers the same way whether
   * or not the address has an account, so the success message stays the same
   * and still reveals nothing.
   *
   * A failure to reach the service is a different thing from an unknown
   * address, and is said so — otherwise somebody offline is told to check an
   * inbox that will stay empty.
   */
  const onSubmit = async (values: ForgotPasswordValues) => {
    setSubmitting(true);
    setFailure(null);
    try {
      await api.requestPasswordReset(values.email.trim());
      setSent(true);
    } catch (cause) {
      setFailure(
        describeApiError(cause, t, {
          title: t('auth.resetFailedTitle'),
          body: t('auth.resetFailedBody'),
        }),
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
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
        contentContainerClassName="gap-6 px-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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

            {failure ? (
              <Glass elevation="low" className="flex-row items-start gap-3 rounded-lg p-4">
                <Ionicons name="alert-circle-outline" size={20} color={c.danger} />
                <View className="flex-1 gap-1">
                  <Text variant="body-sm" className="font-sans-semibold">
                    {failure.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {failure.body}
                  </Text>
                </View>
              </Glass>
            ) : null}

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
