import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Glass, Pressable, SkeletonList, Text } from '@/components/ui';
import { AuthField } from '@/features/auth/AuthField';
import {
  useAttachDocument,
  useOnboarding,
  useSaveStep,
  useSubmitApplication,
} from '@/hooks/useOnboarding';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import { useColors } from '@/lib/theme';
import {
  DOCUMENT_REQUIREMENTS,
  ONBOARDING_STEPS,
  isEditable,
  outstandingFor,
  readyToSubmit,
  stepState,
  type DocumentId,
  type OnboardingStepId,
  type OnboardingStepMeta,
  type StepStatus,
} from '@/types/onboarding';

/**
 * Applying to join the platform, from a phone.
 *
 * An organisation registers and is *pending*: the service creates it, grants an
 * owner membership, and refuses every `/org/*` route but this one until a
 * platform administrator approves the application. So this is not a banner over
 * the inbox — it is the whole of what the account can do, and it says so.
 *
 * Four steps, each saved as you go and submitted separately. Per-step review is
 * the point: an application reviewed as one blob is accepted or rejected whole,
 * and the applicant is told "declined" with no idea which document was wrong.
 * A step that comes back rejected carries the reviewer's reason and becomes
 * editable again; the others stay locked.
 *
 * Documents are photographed rather than picked from a file system. On a phone
 * that is what actually happens to a certificate of incorporation — it is a
 * piece of paper in an office — and `expo-image-picker` offers the camera and
 * the library together, which covers the person who already has a scan.
 */
const STATUS_TONE: Record<StepStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  not_started: 'neutral',
  in_progress: 'accent',
  submitted: 'accent',
  approved: 'success',
  rejected: 'danger',
};

export function OrgOnboardingScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshMembership = useAuthStore((s) => s.refreshMembership);

  const { data: application, isPending, isError, error, refetch, isRefetching } = useOnboarding();
  const saveStep = useSaveStep();
  const attach = useAttachDocument();
  const submitAll = useSubmitApplication();

  const [openStep, setOpenStep] = useState<OnboardingStepId>('organisation');
  /** What is typed but not yet saved, per step. */
  const [drafts, setDrafts] = useState<Partial<Record<OnboardingStepId, Record<string, string>>>>(
    {},
  );

  /*
   * An approved application is not this screen's business any more.
   *
   * The decision is made by a person, days later, and nothing on the phone hears
   * about it — so the profile is re-asked whenever this screen is pulled down,
   * and the moment it comes back approved the account belongs in its inbox.
   */
  useEffect(() => {
    if (profile?.orgVerified === true) router.replace('/(org)');
  }, [profile?.orgVerified, router]);

  const payloadFor = (step: OnboardingStepMeta): Record<string, string> => {
    const stored = application?.payloads[step.id] ?? {};
    const draft = drafts[step.id] ?? {};
    const merged: Record<string, string> = {};
    for (const field of step.fields) {
      merged[field.key] = draft[field.key] ?? String(stored[field.key] ?? '');
    }
    return merged;
  };

  const setField = (stepId: OnboardingStepId, key: string, value: string) =>
    setDrafts((prev) => ({ ...prev, [stepId]: { ...(prev[stepId] ?? {}), [key]: value } }));

  const failed = (cause: unknown, titleKey: string, bodyKey: string) => {
    const copy = describeApiError(cause, t, { title: t(titleKey), body: t(bodyKey) });
    toast.error(copy.title, copy.body);
  };

  const save = (step: OnboardingStepMeta, send: boolean) =>
    saveStep.mutate(
      { stepId: step.id, payload: payloadFor(step), send },
      {
        onSuccess: () => {
          // The draft has landed on the server; keeping it would shadow whatever
          // the server did with it, including a value it normalised.
          setDrafts((prev) => ({ ...prev, [step.id]: {} }));
          toast.success(
            send ? t('apply.stepSentTitle') : t('apply.stepSavedTitle'),
            send ? t('apply.stepSentBody') : t('apply.stepSavedBody'),
          );
        },
        onError: (cause) => failed(cause, 'apply.stepFailedTitle', 'apply.stepFailedBody'),
      },
    );

  /*
   * A photograph or a scan, whichever they have.
   *
   * Permission is asked by the picker itself; a refusal comes back as a
   * cancelled selection, which is indistinguishable from changing your mind and
   * needs no message of its own.
   */
  const pickDocument = async (documentType: DocumentId) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      // The service checks the bytes against a hash of the file as it is on
      // disk, so nothing may be re-encoded after it is read.
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    attach.mutate(
      {
        documentType,
        uri: asset.uri,
        fileName: asset.fileName ?? `${documentType}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      },
      {
        onSuccess: () => toast.success(t('apply.documentAddedTitle'), t('apply.documentAddedBody')),
        onError: (cause) => failed(cause, 'apply.documentFailedTitle', 'apply.documentFailedBody'),
      },
    );
  };

  const held = useMemo(
    () => new Set((application?.documents ?? []).map((d) => d.id)),
    [application],
  );

  const sent = Boolean(application?.submittedAtIso);
  const canSubmit = readyToSubmit(application);

  if (isPending) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 24 }}>
        <SkeletonList count={4} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 40,
        }}
        contentContainerClassName="gap-4 px-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              // Both halves: the application itself, and whether the platform
              // has approved the organisation since this screen was opened.
              void refetch();
              void refreshMembership();
            }}
            tintColor={c.accent}
          />
        }
      >
        <View className="gap-1">
          <Text variant="title-lg">{profile?.orgName ?? t('apply.title')}</Text>
          <Text variant="body-sm" tone="muted">
            {sent ? t('apply.sentSubtitle') : t('apply.subtitle')}
          </Text>
        </View>

        {isError ? (
          <Glass elevation="low" className="gap-2 rounded-lg p-4">
            <Text variant="body" className="font-sans-medium">
              {describeApiError(error, t, {
                title: t('apply.loadFailedTitle'),
                body: t('apply.loadFailedBody'),
              }).title}
            </Text>
            <Button label={t('common.retry')} variant="glass" onPress={() => void refetch()} />
          </Glass>
        ) : null}

        {/*
          Sent, and now waiting on a person.

          The applicant can still see everything they submitted — a read-only
          record is the difference between "we are reviewing it" and "it has
          gone somewhere".
        */}
        {sent ? (
          <Glass elevation="low" className="flex-row items-start gap-3 rounded-lg p-4">
            <Ionicons name="hourglass-outline" size={20} color={c.warning} />
            <View className="flex-1 gap-1">
              <Text variant="body" className="font-sans-medium">
                {t('apply.underReviewTitle')}
              </Text>
              <Text variant="body-sm" tone="muted">
                {t('apply.underReviewBody')}
              </Text>
            </View>
          </Glass>
        ) : null}

        {ONBOARDING_STEPS.map((step) => {
          const state = stepState(application, step.id);
          const open = openStep === step.id;
          const editable = isEditable(state.status) && !sent;
          const values = payloadFor(step);
          const outstanding = outstandingFor(step, values, application?.documents ?? []);
          const complete =
            outstanding.fields.length === 0 && outstanding.documents.length === 0;

          return (
            <Glass key={step.id} elevation="low" className="gap-0 overflow-hidden rounded-lg">
              <Pressable
                onPress={() => setOpenStep(open ? ('documents' as OnboardingStepId) : step.id)}
                accessibilityLabel={t(`apply.step.${step.id}`)}
                accessibilityState={{ expanded: open }}
                style={{ minHeight: 76, paddingVertical: 16, paddingHorizontal: 16 }}
                className="flex-row items-center gap-3"
              >
                <View className="flex-1 gap-0.5">
                  <Text variant="title-sm">{t(`apply.step.${step.id}`)}</Text>
                  <Text variant="caption" tone="muted">
                    {t(`apply.stepHelp.${step.id}`)}
                  </Text>
                </View>
                <Badge
                  label={t(`apply.status.${state.status}`)}
                  tone={STATUS_TONE[state.status]}
                />
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={c.textFaint}
                />
              </Pressable>

              {open ? (
                <View className="gap-4 border-t border-hairline/[0.08] px-4 py-4">
                  {/*
                    A reviewer's reason, where there is one. It is the only thing
                    that tells an applicant what to change, so it sits above the
                    fields rather than beside the status chip.
                  */}
                  {state.rejectionReason ? (
                    <View className="gap-1 rounded-sm bg-danger-wash px-3 py-2.5">
                      <Text variant="caption" tone="danger" className="font-sans-semibold">
                        {t('apply.sentBack')}
                      </Text>
                      <Text variant="body-sm">{state.rejectionReason}</Text>
                    </View>
                  ) : null}

                  {step.fields.map((field) => (
                    <AuthField
                      key={field.key}
                      label={t(`apply.field.${field.key}`)}
                      value={values[field.key] ?? ''}
                      onChangeText={(value) => setField(step.id, field.key, value)}
                      editable={editable}
                      placeholder={t(`apply.placeholder.${field.key}`)}
                      keyboardType={field.numeric ? 'number-pad' : 'default'}
                      autoCapitalize={field.key === 'tin' ? 'characters' : 'words'}
                    />
                  ))}

                  {step.documents.map((documentType) => (
                    <DocumentSlot
                      key={documentType}
                      documentType={documentType}
                      attached={held.has(documentType)}
                      busy={attach.isPending}
                      disabled={!editable}
                      onPick={() => void pickDocument(documentType)}
                    />
                  ))}

                  {/*
                    The last step collects nothing. It is where the whole
                    application is sent, once the other three have gone.
                  */}
                  {step.id === 'documents' ? (
                    <View className="gap-3">
                      <Text variant="body-sm" tone="muted">
                        {canSubmit ? t('apply.readyBody') : t('apply.notReadyBody')}
                      </Text>
                      <Button
                        label={t('apply.submitApplication')}
                        size="lg"
                        fullWidth
                        disabled={!canSubmit || sent}
                        loading={submitAll.isPending}
                        onPress={() =>
                          submitAll.mutate(undefined, {
                            onSuccess: () =>
                              toast.success(t('apply.sentTitle'), t('apply.sentBody')),
                            onError: (cause) =>
                              failed(cause, 'apply.submitFailedTitle', 'apply.submitFailedBody'),
                          })
                        }
                      />
                    </View>
                  ) : editable ? (
                    <View className="gap-2">
                      {!complete ? (
                        <Text variant="caption" tone="muted">
                          {t('apply.outstanding', {
                            items: [
                              ...outstanding.fields.map((key) => t(`apply.field.${key}`)),
                              ...outstanding.documents.map((id) => t(`apply.document.${id}`)),
                            ].join(', '),
                          })}
                        </Text>
                      ) : null}
                      <Button
                        label={t('apply.saveStep')}
                        variant="glass"
                        size="lg"
                        fullWidth
                        loading={saveStep.isPending}
                        onPress={() => save(step, false)}
                      />
                      <Button
                        label={t('apply.sendStep')}
                        size="lg"
                        fullWidth
                        disabled={!complete}
                        loading={saveStep.isPending}
                        onPress={() => save(step, true)}
                      />
                    </View>
                  ) : (
                    <Text variant="caption" tone="muted">
                      {t('apply.lockedBody')}
                    </Text>
                  )}
                </View>
              ) : null}
            </Glass>
          );
        })}

        {/*
          A way out that is not "finish the application".

          Somebody who started this on the wrong account, or who wants to use
          the phone as a reporter while the application is reviewed, otherwise
          has no exit at all — this screen replaces the whole app for them.
        */}
        <Button
          label={t('settings.signOut')}
          variant="ghost"
          size="lg"
          fullWidth
          onPress={() => {
            void signOut();
            toast.info(t('auth.signedOutTitle'), t('auth.signedOutBody'));
            router.replace('/(auth)/sign-in');
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DocumentSlot({
  documentType,
  attached,
  busy,
  disabled,
  onPick,
}: {
  documentType: DocumentId;
  attached: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const required = DOCUMENT_REQUIREMENTS[documentType].required;

  return (
    <Pressable
      onPress={disabled || busy ? undefined : onPick}
      disabled={disabled || busy}
      accessibilityLabel={t(`apply.document.${documentType}`)}
      style={{ minHeight: 72, paddingVertical: 14, paddingHorizontal: 14 }}
      className={
        attached
          ? 'flex-row items-center gap-3 rounded-lg border border-success/40 bg-success-wash'
          : 'flex-row items-center gap-3 rounded-lg border border-hairline/[0.12]'
      }
    >
      <Ionicons
        name={attached ? 'checkmark-circle' : 'camera-outline'}
        size={22}
        color={attached ? c.success : c.textMuted}
      />
      <View className="flex-1 gap-0.5">
        <Text variant="body" className="font-sans-medium">
          {t(`apply.document.${documentType}`)}
        </Text>
        <Text variant="caption" tone="muted">
          {attached
            ? t('apply.documentAttached')
            : required
              ? t('apply.documentRequired')
              : t('apply.documentOptional')}
        </Text>
      </View>
      {!disabled ? (
        <Text variant="body-sm" tone="accent" className="font-sans-semibold">
          {attached ? t('apply.replace') : t('apply.add')}
        </Text>
      ) : null}
    </Pressable>
  );
}
