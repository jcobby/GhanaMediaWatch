import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { hapticUnlock } from '@/lib/haptics';
import { AuthField } from './AuthField';
import { passwordStrength, signUpSchema, type SignUpValues } from './schemas';

const STRENGTH_LABEL = ['tooShort', 'weak', 'good', 'strong'] as const;
const STRENGTH_CLASS = ['bg-danger', 'bg-warning', 'bg-info', 'bg-success'] as const;

export function SignUpScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const register = useAuthStore((s) => s.register);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: true,
    },
    mode: 'onBlur',
  });

  /*
   * `useWatch`, not the form's `watch`.
   *
   * `watch` re-reads a mutable store during render, which the React Compiler
   * cannot reason about — it bailed out of compiling this whole screen, and
   * the lint gate is set to zero warnings, so one bailout here meant `npm run
   * lint` failed for every change anywhere in the app. `useWatch` is the
   * subscription form react-hook-form provides for exactly this, and it
   * subscribes to one field rather than re-rendering on every keystroke in the
   * form.
   */
  const password = useWatch({ control, name: 'password' });
  const accepted = useWatch({ control, name: 'acceptedTerms' });
  const strength = passwordStrength(password);

  const onSubmit = async (values: SignUpValues) => {
    setSubmitting(true);
    try {
      await register(values.email, values.password, values.displayName);

      /*
       * Say that it worked.
       *
       * The screen used to swap for the feed and nothing else — no line, no
       * sound, no shift under the thumb. Somebody who has just typed a password
       * twice has no way to tell "account created" from "the app moved on
       * without me", and the natural response is to go back and try again.
       */
      hapticUnlock();
      toast.success(t('auth.accountCreatedTitle'), t('auth.accountCreatedBody'));
      router.replace('/(tabs)');
    } catch (cause) {
      toast.error(
        t('auth.signUpFailed'),
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
          <Text variant="title-lg">{t('auth.createAccount')}</Text>
        </View>

        <Text variant="body" tone="muted">
          {t('auth.signUpSubtitle')}
        </Text>

        <View className="gap-4">
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                label={t('auth.displayName')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.displayName?.message}
                placeholder={t('auth.displayNamePlaceholder')}
                autoCapitalize="words"
                autoComplete="name"
              />
            )}
          />
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
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <View className="gap-2">
                <AuthField
                  label={t('auth.password')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.password?.message}
                  placeholder={t('auth.passwordPlaceholder')}
                  secure
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                {value.length > 0 ? (
                  <View className="flex-row items-center gap-2">
                    <View className="h-1 flex-1 flex-row gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={i}
                          className={
                            i <= strength
                              ? `h-1 flex-1 rounded-pill ${STRENGTH_CLASS[strength]}`
                              : 'h-1 flex-1 rounded-pill bg-canvas-raise'
                          }
                        />
                      ))}
                    </View>
                    <Text variant="caption" tone="muted">
                      {t(`auth.strength.${STRENGTH_LABEL[strength]}`)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                label={t('auth.confirmPassword')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.confirmPassword?.message}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                secure
                autoCapitalize="none"
                autoComplete="new-password"
              />
            )}
          />
        </View>

        <Controller
          control={control}
          name="acceptedTerms"
          render={({ field: { onChange } }) => (
            <Pressable
              onPress={() => onChange(!accepted)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              accessibilityLabel={t('auth.acceptTerms')}
              className="flex-row items-start gap-3"
            >
              <View
                className={
                  accepted
                    ? 'h-5 w-5 items-center justify-center rounded-xs bg-accent'
                    : 'h-5 w-5 items-center justify-center rounded-xs border border-hairline/30'
                }
              >
                {accepted ? <Ionicons name="checkmark" size={13} color={c.textOnDark} /> : null}
              </View>
              <Text variant="body-sm" tone="muted" className="flex-1">
                {t('auth.acceptTerms')}
              </Text>
            </Pressable>
          )}
        />
        {formState.errors.acceptedTerms ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {formState.errors.acceptedTerms.message}
          </Text>
        ) : null}

        <Button
          label={t('auth.createAccount')}
          size="lg"
          fullWidth
          loading={submitting}
          onPress={handleSubmit(onSubmit)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
