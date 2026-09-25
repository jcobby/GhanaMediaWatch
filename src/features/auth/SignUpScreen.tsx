import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { homeRouteFor } from '@/lib/homeRoute';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { hapticUnlock } from '@/lib/haptics';
import { ORGANISATION_SECTORS } from '@/types/dawuro';
import { AuthField } from './AuthField';
import { GoogleButton } from './GoogleButton';
import { ACCOUNT_KINDS, passwordStrength, signUpSchema, type SignUpValues } from './schemas';

const STRENGTH_LABEL = ['tooShort', 'weak', 'good', 'strong'] as const;
const STRENGTH_CLASS = ['bg-danger', 'bg-warning', 'bg-info', 'bg-success'] as const;

export function SignUpScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const register = useAuthStore((s) => s.register);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, formState, setValue } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      accountKind: 'reporter',
      displayName: '',
      organisationName: '',
      organisationSector: 'other',
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
  const kind = useWatch({ control, name: 'accountKind' });
  const sector = useWatch({ control, name: 'organisationSector' });
  const strength = passwordStrength(password);
  const isOrganisation = kind === 'organisation';

  const onSubmit = async (values: SignUpValues) => {
    setSubmitting(true);
    try {
      await register({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        /*
         * The organisation half is sent only when one was asked for. The
         * service reads its presence as "create a pending organisation", so a
         * stray empty object on a reporter's registration would apply on their
         * behalf to join the platform.
         */
        ...(values.accountKind === 'organisation'
          ? {
              organisation: {
                name: (values.organisationName ?? '').trim(),
                sector: values.organisationSector ?? 'other',
              },
            }
          : {}),
      });

      /*
       * Say that it worked.
       *
       * The screen used to swap for the feed and nothing else — no line, no
       * sound, no shift under the thumb. Somebody who has just typed a password
       * twice has no way to tell "account created" from "the app moved on
       * without me", and the natural response is to go back and try again.
       */
      hapticUnlock();
      /*
       * And say which of the two things happened. A reporter has an account and
       * can file now; an organisation has an *application* that a person has to
       * approve, and telling it "account created" would promise access it does
       * not have.
       */
      if (values.accountKind === 'organisation') {
        toast.success(t('auth.applicationStartedTitle'), t('auth.applicationStartedBody'));
      } else {
        toast.success(t('auth.accountCreatedTitle'), t('auth.accountCreatedBody'));
      }
      // The store has read `/me` by now, so this lands on the onboarding
      // application for an organisation and on the feed for a reporter.
      router.replace(homeRouteFor(useAuthStore.getState().profile));
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
          {isOrganisation ? t('auth.signUpOrgSubtitle') : t('auth.signUpSubtitle')}
        </Text>

        {/*
          Which of the two accounts this is, chosen before anything is typed.

          Not a checkbox at the bottom: the answer changes what the form asks
          for, what the service creates, and where the app goes next. An
          organisation's registration opens an application that a platform
          administrator reviews — it is not a faster way to get the same account.
        */}
        <Controller
          control={control}
          name="accountKind"
          render={({ field: { onChange } }) => (
            <View className="gap-2">
              {ACCOUNT_KINDS.map((value) => {
                const on = kind === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => onChange(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(`auth.kind.${value}`)}
                    style={{ minHeight: 76, paddingVertical: 14, paddingHorizontal: 16 }}
                    className={
                      on
                        ? 'flex-row items-center gap-3 rounded-lg border border-accent/60 bg-accent-wash'
                        : 'flex-row items-center gap-3 rounded-lg border border-hairline/[0.12]'
                    }
                  >
                    <Ionicons
                      name={value === 'organisation' ? 'business-outline' : 'person-outline'}
                      size={22}
                      color={on ? c.accent : c.textMuted}
                    />
                    <View className="flex-1">
                      <Text variant="title-sm">{t(`auth.kind.${value}`)}</Text>
                      <Text variant="caption" tone="muted">
                        {t(`auth.kindHelp.${value}`)}
                      </Text>
                    </View>
                    {on ? <Ionicons name="checkmark" size={18} color={c.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        />

        <View className="gap-4">
          {isOrganisation ? (
            <>
              <Controller
                control={control}
                name="organisationName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AuthField
                    label={t('auth.organisationName')}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={formState.errors.organisationName?.message}
                    placeholder={t('auth.organisationNamePlaceholder')}
                    autoCapitalize="words"
                    maxLength={80}
                  />
                )}
              />
              {/*
                Sector, as chips rather than a picker. Seven values, and the one
                a person wants is usually visible without opening anything.
              */}
              <View className="gap-2">
                <Text variant="label" tone="muted">
                  {t('auth.organisationSector')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {ORGANISATION_SECTORS.map((value) => (
                    <Chip
                      key={value}
                      label={t(`sector.${value}`)}
                      selected={sector === value}
                      onPress={() => setValue('organisationSector', value)}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                // For an organisation this is the person signing up, not the
                // institution — the institution has its own field above.
                label={isOrganisation ? t('auth.yourName') : t('auth.displayName')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.displayName?.message}
                placeholder={
                  isOrganisation
                    ? t('auth.yourNamePlaceholder')
                    : t('auth.displayNamePlaceholder')
                }
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

        {/*
          Offered to a reporter only.

          A Google account creates a *person's* account — `/auth/google` takes
          no organisation, so there is nothing for it to apply with. An
          institution registers with the form above and then works through the
          application; putting the button here would be a shortcut that quietly
          produces the wrong kind of account.
        */}
        {!isOrganisation ? <GoogleButton /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
