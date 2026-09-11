import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, Glass, Pressable, Text } from '@/components/ui';
import { AuthField } from '@/features/auth/AuthField';
import { emailSchema } from '@/features/auth/schemas';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '@/types/api';
import {
  SUBSCRIPTION_PLANS,
  formatCedis,
  isUnlimited,
  type OrganisationSector,
  type SubscriptionTier,
} from '@/types/dawuro';
import { accentGradient, categoryColor, useColors } from '@/lib/theme';
import { toast } from '@/stores/toastStore';

const SECTORS: OrganisationSector[] = [
  'government',
  'media',
  'utility',
  'insurance',
  'ngo',
  'research',
  'other',
];

const organisationSchema = z.object({
  organisationName: z
    .string()
    .trim()
    .min(3, 'Enter the full registered name of your organisation')
    .max(80, 'Keep this under 80 characters'),
  contactName: z.string().trim().min(2, 'Who should we contact about this account?'),
  email: emailSchema,
  // Ghana numbers are 10 digits locally, or +233 followed by 9.
  phone: z
    .string()
    .trim()
    .regex(/^(\+233\d{9}|0\d{9})$/, 'Enter a Ghana number, e.g. 024 000 0000'),
  registrationNumber: z.string().trim().min(4, 'Enter your registration or agency reference'),
});

type OrganisationValues = z.infer<typeof organisationSchema>;

type Step = 'details' | 'interests' | 'plan';

/**
 * Organisation registration for the Dawuro platform.
 *
 * Split across three steps because the information belongs to three different
 * decisions — who you are, what you want to receive, and what you will pay. A
 * single long form makes an organisation abandon at the first field they need
 * to go and look up.
 *
 * Nothing here activates an account. An organisation is created pending verification:
 * these accounts receive footage of the public, sometimes of people in
 * distress, and self-service access to that would be indefensible.
 */
export function OrganisationSignUpScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('details');
  const [sector, setSector] = useState<OrganisationSector>('government');
  const [interests, setInterests] = useState<IncidentCategory[]>([]);
  const [tier, setTier] = useState<SubscriptionTier>('standard');
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, formState } = useForm<OrganisationValues>({
    resolver: zodResolver(organisationSchema),
    defaultValues: {
      organisationName: '',
      contactName: '',
      email: '',
      phone: '',
      registrationNumber: '',
    },
    mode: 'onBlur',
  });

  const toggleInterest = (category: IncidentCategory) => {
    setInterests((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const finish = async () => {
    setSubmitting(true);
    try {
      /*
       * There is nowhere to send this.
       *
       * The API has no endpoint that creates an organisation — `/auth/register`
       * makes a reporter account, and every `/org/*` route requires membership
       * of one that already exists. This used to mint a local id
       * (`biz_${Date.now()}`) and sign the applicant into an organisation account the
       * server had never heard of, so every screen behind it asked about an
       * organisation that did not exist.
       *
       * Refusing is the honest outcome. The details stay on screen so nothing
       * they typed is lost while they copy it.
       */
      toast.error(t('organisation.cannotSubmitTitle'), t('organisation.cannotSubmitBody'));
    } catch (cause) {
      toast.error(
        t('organisation.submitFailed'),
        cause instanceof Error ? cause.message : t('common.unknownErrorHelp'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = ['details', 'interests', 'plan'].indexOf(step);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
        contentContainerClassName="gap-5 px-5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() =>
              stepIndex === 0 ? router.back() : setStep(stepIndex === 2 ? 'interests' : 'details')
            }
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
              {t('organisation.brand')}
            </Text>
            <Text variant="title-lg">{t('organisation.createAccount')}</Text>
          </View>
        </View>

        {/* Step indicator */}
        <View className="flex-row gap-1.5">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className={
                i <= stepIndex
                  ? 'h-1 flex-1 rounded-pill bg-accent'
                  : 'h-1 flex-1 rounded-pill bg-canvas-raise'
              }
            />
          ))}
        </View>

        {step === 'details' ? (
          <View className="gap-4">
            <Text variant="body" tone="muted">
              {t('organisation.detailsHelp')}
            </Text>

            <Controller
              control={control}
              name="organisationName"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthField
                  label={t('organisation.organisationName')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.organisationName?.message}
                  placeholder={t('organisation.organisationNamePlaceholder')}
                  autoCapitalize="words"
                />
              )}
            />

            <View className="gap-2">
              <Text variant="label" tone="muted">
                {t('organisation.sector')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {SECTORS.map((s) => (
                  <Chip
                    key={s}
                    label={t(`sector.${s}`)}
                    selected={sector === s}
                    onPress={() => setSector(s)}
                  />
                ))}
              </View>
            </View>

            <Controller
              control={control}
              name="registrationNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthField
                  label={t('organisation.registrationNumber')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.registrationNumber?.message}
                  placeholder={t('organisation.registrationNumberPlaceholder')}
                  autoCapitalize="characters"
                />
              )}
            />
            <Controller
              control={control}
              name="contactName"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthField
                  label={t('organisation.contactName')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.contactName?.message}
                  placeholder={t('organisation.contactNamePlaceholder')}
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthField
                  label={t('organisation.workEmail')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.email?.message}
                  placeholder="name@organisation.gov.gh"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthField
                  label={t('organisation.phone')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.phone?.message}
                  placeholder="024 000 0000"
                  keyboardType="phone-pad"
                />
              )}
            />

            <Button
              label={t('common.next')}
              size="lg"
              fullWidth
              onPress={handleSubmit(() => setStep('interests'))}
            />
          </View>
        ) : null}

        {step === 'interests' ? (
          <View className="gap-4">
            <View className="gap-1">
              <Text variant="title-md">{t('organisation.interestsTitle')}</Text>
              <Text variant="body" tone="muted">
                {t('organisation.interestsHelp')}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {INCIDENT_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={t(`category.${c}`)}
                  dotColor={categoryColor[c]}
                  selected={interests.includes(c)}
                  onPress={() => toggleInterest(c)}
                />
              ))}
            </View>

            {/* This is the routing input, so its consequence is stated here
                rather than discovered later through an empty inbox. */}
            <Glass elevation="low" className="flex-row items-start gap-2.5 rounded-lg p-3.5">
              <Ionicons name="git-branch-outline" size={16} color={c.accent} />
              <Text variant="caption" tone="muted" className="flex-1">
                {t('organisation.routingNote')}
              </Text>
            </Glass>

            <Button
              label={t('common.next')}
              size="lg"
              fullWidth
              disabled={interests.length === 0}
              onPress={() => setStep('plan')}
            />
          </View>
        ) : null}

        {step === 'plan' ? (
          <View className="gap-4">
            <View className="gap-1">
              <Text variant="title-md">{t('organisation.planTitle')}</Text>
              <Text variant="body" tone="muted">
                {t('organisation.planHelp')}
              </Text>
            </View>

            <View className="gap-3">
              {(Object.keys(SUBSCRIPTION_PLANS) as SubscriptionTier[]).map((key) => {
                const plan = SUBSCRIPTION_PLANS[key];
                const active = tier === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setTier(key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`organisation.tier.${key}`)}
                  >
                    <Glass
                      elevation={active ? 'mid' : 'low'}
                      className={
                        active
                          ? 'gap-3 rounded-lg border border-accent p-4'
                          : 'gap-3 rounded-lg p-4'
                      }
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="gap-0.5">
                          <Text variant="title-sm">{t(`organisation.tier.${key}`)}</Text>
                          <Text variant="caption" tone="muted">
                            {isUnlimited(plan)
                              ? t('organisation.unlimitedDownloads')
                              : t('organisation.perDownload', {
                                  amount: formatCedis(plan.perDownloadPesewas ?? 0),
                                })}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text variant="title-md" className="font-display">
                            {formatCedis(plan.feePesewas, { compact: true })}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {t('organisation.perMonth')}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row flex-wrap gap-1.5">
                        <Badge label={t('organisation.seats', { count: plan.seats })} />
                        <Badge
                          label={t('organisation.overage', {
                            amount: formatCedis(plan.feePesewas, { compact: true }),
                          })}
                        />
                        {plan.concurrentSurveys > 0 ? (
                          <Badge
                            label={t('organisation.surveys', { count: plan.concurrentSurveys })}
                          />
                        ) : null}
                        {plan.canDirectRequest ? (
                          <Badge label={t('organisation.canRequest')} tone="accent" />
                        ) : null}
                      </View>
                    </Glass>
                  </Pressable>
                );
              })}
            </View>

            {/* Verification is not optional, and saying so up front avoids an
                organisation believing they have instant access. */}
            <LinearGradient
              colors={[...accentGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12 }}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={c.textOnDark} />
              <View className="flex-1 gap-0.5">
                <Text variant="body-sm" className="font-sans-semibold text-white">
                  {t('organisation.verificationTitle')}
                </Text>
                <Text variant="caption" className="text-white/80">
                  {t('organisation.verificationBody')}
                </Text>
              </View>
            </LinearGradient>

            <Button
              label={t('organisation.submitApplication')}
              size="lg"
              fullWidth
              loading={submitting}
              onPress={() => void finish()}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
