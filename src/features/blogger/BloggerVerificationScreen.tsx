import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ErrorState, Pressable, SkeletonList, Text } from '@/components/ui';
import { AuthField } from '@/features/auth/AuthField';
import { useColors } from '@/lib/theme';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { describeApiError } from '@/lib/apiErrorCopy';
import {
  useAttachVerificationDocument,
  useSaveVerificationStep,
  useSubmitVerification,
  useVerification,
} from '@/hooks/useVerification';
import {
  BLOGGER_STEPS,
  documentSatisfied,
  outstandingFor,
  readyToSubmit,
  stepState,
  type BloggerApplication,
  type BloggerDocumentId,
  type BloggerStepId,
} from '@/types/bloggerVerification';

/**
 * A blogger's application to publish under a checked byline.
 *
 * **Nothing here blocks them.** A blogger can file, earn and be paid from the
 * moment they register — `/me` returns `kind: "user"` for them and every
 * reporter route works. This screen adds one thing: a byline a reader can see
 * has been checked. That distinction is why this is reached from the profile
 * rather than thrown in front of them at launch, and why the copy says what
 * verification *gives* rather than what it unlocks.
 *
 * It is deliberately close to the organisation's wizard in shape — three steps,
 * save then send, documents declared and then uploaded — because the service's
 * `/me/verification/*` routes mirror `/org/onboarding/*` exactly, and two
 * screens that do the same thing differently is how one of them rots.
 *
 * The step set is the client's: `PersonApplication.steps` is an open map and a
 * fresh application arrives empty, so `types/bloggerVerification` is the
 * definition of what is asked for.
 */
export function BloggerVerificationScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: application, isPending, isError, refetch, enabled } = useVerification();
  const refreshMembership = useAuthStore((s) => s.refreshMembership);
  const profileVerified = useAuthStore((s) => s.profile?.verified === true);

  /*
   * Pick up an approval the phone slept through.
   *
   * `profile.verified` is written at sign-in and nowhere else, so a blogger
   * approved a week after they applied — on a phone never signed out of — would
   * keep seeing an unverified account forever. This is the screen they open to
   * check, and the application is the thing that knows: when it says approved
   * and the profile does not, the profile is stale rather than right.
   *
   * Guarded on the disagreement rather than run on every mount, so opening a
   * pending application does not fire a `/me` each time.
   */
  const approvedAt = application?.approvedAtIso ?? null;
  useEffect(() => {
    if (approvedAt && !profileVerified) void refreshMembership();
  }, [approvedAt, profileVerified, refreshMembership]);
  const save = useSaveVerificationStep();
  const attach = useAttachVerificationDocument();
  const submit = useSubmitVerification();

  /**
   * What is on screen, which is not always what the service holds.
   *
   * Typing has to be instant and a round trip per keystroke is not, so edits
   * live here until Save. Keyed by step so switching between them does not
   * discard work — which the organisation's wizard learned when its single
   * draft object meant opening step two threw away step one.
   */
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  /**
   * Which step is expanded, or none.
   *
   * Nullable, and that is the fix rather than a nicety: collapsing used to set
   * this to `'identity'`, so tapping the open "Where you publish" header jumped
   * the reader back to step one instead of closing, and the Identity header
   * could never be closed at all because setting it to itself changes nothing.
   */
  const [open, setOpen] = useState<BloggerStepId | null>('identity');

  /*
   * The service's own words where it has any, this screen's where it does not.
   * Same helper the organisation's wizard uses, so a refused upload reads the
   * same on both.
   */
  const failed = (cause: unknown, titleKey: string) => {
    const copy = describeApiError(cause, t, {
      title: t(titleKey),
      body: t('common.unknownErrorHelp'),
    });
    toast.error(copy.title, copy.body);
  };

  /*
   * Not a blogger, so there is nothing here and never will be.
   *
   * The query is disabled for them, which react-query reports as `isPending`
   * forever — so this has to be checked first or the screen is a skeleton with
   * no header and no way back.
   */
  if (!enabled) {
    return (
      <ErrorState
        title={t('verify.notBloggerTitle')}
        description={t('verify.notBloggerBody')}
        retryLabel={t('common.back')}
        onRetry={() => router.back()}
      />
    );
  }

  if (isPending) return <SkeletonList />;
  if (isError || !application) {
    return (
      <ErrorState
        title={t('verify.title')}
        description={t('common.unknownErrorHelp')}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  }

  const sent = Boolean(application.submittedAtIso);
  const approved = Boolean(application.approvedAtIso);

  /** The service's answers, with anything typed since laid over them. */
  const valuesFor = (id: BloggerStepId): Record<string, string> => ({
    ...stepState(application, id).values,
    ...(drafts[id] ?? {}),
  });

  const edit = (id: BloggerStepId, key: string, value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }));

  const persist = (id: BloggerStepId, send: boolean) => {
    save.mutate(
      { stepId: id, payload: valuesFor(id), send },
      {
        onSuccess: () => {
          // Cleared only once the service has it, so a failure leaves the
          // typing on screen rather than silently discarding it.
          setDrafts((prev) => ({ ...prev, [id]: {} }));
          if (send) toast.success(t('verify.sentTitle'), t('verify.sentBody'));
          else toast.success(t('verify.savedTitle'));
        },
        onError: (cause) => failed(cause, 'verify.saveFailedTitle'),
      },
    );
  };

  /**
   * A photograph or a scan, whichever they have.
   *
   * Permission is asked by the picker itself; a refusal comes back as a
   * cancelled selection, which is indistinguishable from changing your mind and
   * needs no message of its own.
   */
  const pickDocument = async (documentType: BloggerDocumentId) => {
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
        onSuccess: () => toast.success(t('verify.documentAddedTitle')),
        onError: (cause) => failed(cause, 'verify.documentFailedTitle'),
      },
    );
  };

  const canSubmit = readyToSubmit(application);

  /**
   * Which document is uploading, rather than whether any is.
   *
   * `attach.isPending` is one flag for one mutation, and every Attach button in
   * a step was given it — so starting one upload put a spinner on all of them
   * and disabled the lot, which reads as the screen having frozen rather than
   * as one file in flight.
   */
  const attaching = attach.isPending ? attach.variables?.documentType : undefined;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
        contentContainerClassName="gap-5 px-5"
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
          <Text variant="title-lg">{t('verify.title')}</Text>
        </View>

        <Header application={application} approved={approved} sent={sent} />

        {BLOGGER_STEPS.map((step) => {
          const state = stepState(application, step.id);
          const values = valuesFor(step.id);
          /*
           * Counted against what is on screen, not only what the server holds.
           *
           * This read `outstandingFor(application, …)`, which sees saved
           * answers alone — so a blogger who had filled every field still had
           * "Save and send" greyed out until they pressed Save first, even
           * though `persist(id, true)` saves before it submits. The button that
           * exists to do both in one press could not be reached without doing
           * the first one separately.
           */
          const out = outstandingFor(withDraft(application, step.id, values), step.id);
          const isOpen = open === step.id;
          const dirty = Object.keys(drafts[step.id] ?? {}).length > 0;

          return (
            <View
              key={step.id}
              className="gap-3 rounded-lg border border-hairline/[0.10] p-4"
              style={{ backgroundColor: c.canvasSoft }}
            >
              <Pressable
                onPress={() => setOpen(isOpen ? null : step.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                className="flex-row items-center gap-3"
              >
                <View className="flex-1 gap-1">
                  <Text variant="title-md">{t(`verify.step.${step.id}`)}</Text>
                  <Text variant="body-sm" tone="muted">
                    {t(`verify.stepHelp.${step.id}`)}
                  </Text>
                </View>
                <StepBadge status={state.status} outstanding={out.fields.length + out.documents.length} />
              </Pressable>

              {/*
                The reviewer's own words, where a step has come back.

                Shown above the fields rather than below them: it is the reason
                this step is open again, and reading it after the form is
                reading it too late.
              */}
              {state.rejectionReason ? (
                <View className="rounded-sm bg-danger-wash px-3 py-2">
                  <Text variant="body-sm" tone="danger">
                    {state.rejectionReason}
                  </Text>
                </View>
              ) : null}

              {isOpen ? (
                <View className="gap-3">
                  {step.fields.map((field) => (
                    <AuthField
                      key={field.key}
                      label={t(`verify.field.${field.key}`)}
                      value={values[field.key] ?? ''}
                      onChangeText={(v) => edit(step.id, field.key, v)}
                      placeholder={t(`verify.placeholder.${field.key}`)}
                      editable={!sent}
                      multiline={field.multiline ?? false}
                      /*
                       * `AuthField` fixes every input at 52pt and drops `style`
                       * (its props are `Omit<TextInputProps, 'style'>`), so a
                       * multiline field rendered as a one-line box with the
                       * text scrolling out of it. `numberOfLines` is what the
                       * platform honours without a style, and the vertical
                       * alignment stops Android centring the first line.
                       */
                      {...(field.multiline
                        ? { numberOfLines: 4, textAlignVertical: 'top' as const }
                        : {})}
                      keyboardType={
                        field.keyboard === 'phone'
                          ? 'phone-pad'
                          : field.keyboard === 'url'
                            ? 'url'
                            : 'default'
                      }
                      autoCapitalize={field.keyboard === 'url' ? 'none' : 'sentences'}
                    />
                  ))}

                  {step.documents.length > 0 ? (
                    <DocumentRow
                      application={application}
                      documents={step.documents}
                      busy={attaching}
                      disabled={sent}
                      onPick={pickDocument}
                    />
                  ) : null}

                  {!sent ? (
                    <View className="flex-row gap-2">
                      <Button
                        label={t('verify.save')}
                        variant="glass"
                        size="sm"
                        disabled={!dirty || save.isPending}
                        onPress={() => persist(step.id, false)}
                      />
                      <Button
                        label={t('verify.sendStep')}
                        size="sm"
                        loading={save.isPending}
                        disabled={out.fields.length > 0 || out.documents.length > 0}
                        onPress={() => persist(step.id, true)}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {!sent ? (
          <Button
            label={t('verify.submit')}
            size="lg"
            fullWidth
            loading={submit.isPending}
            disabled={!canSubmit}
            onPress={() =>
              submit.mutate(undefined, {
                onSuccess: () => toast.success(t('verify.submitted'), t('verify.submittedBody')),
                onError: (cause) => failed(cause, 'verify.submitFailedTitle'),
              })
            }
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The application as it would be if what is typed were already saved.
 *
 * `outstandingFor` reads the server's copy, which is the right source for
 * everything except the one question the buttons ask: can this step be sent
 * *now*. Drafts only exist because a round trip per keystroke is not typing, so
 * they have to count toward completeness or the form disagrees with itself.
 */
function withDraft(
  application: BloggerApplication,
  id: BloggerStepId,
  values: Record<string, string>,
): BloggerApplication {
  const held = stepState(application, id);
  return { ...application, steps: { ...application.steps, [id]: { ...held, values } } };
}

/** Where the application stands, in one line, above the steps. */
function Header({
  application,
  approved,
  sent,
}: {
  application: BloggerApplication;
  approved: boolean;
  sent: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-2">
      <Text variant="body" tone="muted">
        {approved
          ? t('verify.approvedBody')
          : sent
            ? t('verify.submittedBody')
            : t('verify.subtitle')}
      </Text>
      {application.reference ? (
        <Text variant="caption" tone="faint">
          {t('verify.reference', { reference: application.reference })}
        </Text>
      ) : null}
      {/*
        What it is for, said once and kept.

        Somebody reading this has already been told they can file without it, so
        the obvious question is why bother — and an application that never
        answers that is one people abandon halfway.
      */}
      {!approved ? (
        <View className="mt-1 gap-1 rounded-lg bg-canvas-raise p-3.5">
          <Text variant="title-sm">{t('verify.whyTitle')}</Text>
          <Text variant="body-sm" tone="muted">
            {t('verify.whyBody')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StepBadge({ status, outstanding }: { status: string; outstanding: number }) {
  const { t } = useTranslation();
  if (status === 'approved') return <Badge label={t('verify.approved')} tone="success" />;
  if (status === 'rejected') return <Badge label={t('verify.rejected')} tone="danger" />;
  if (status === 'submitted') return <Badge label={t('verify.submitted')} tone="info" />;
  if (outstanding > 0) return <Badge label={String(outstanding)} tone="warning" />;
  return null;
}

/**
 * The documents a step needs.
 *
 * Alternatives are drawn as one row, not two. `utility_bill` and
 * `premises_proof` both prove an address and either satisfies the requirement —
 * listing them separately reads as two things to go and find when one will do,
 * which is how an application stalls on paperwork that adds nothing.
 */
function DocumentRow({
  application,
  documents,
  busy,
  disabled,
  onPick,
}: {
  application: BloggerApplication;
  documents: BloggerDocumentId[];
  /** The document currently uploading, if any — not merely whether one is. */
  busy: BloggerDocumentId | undefined;
  disabled: boolean;
  onPick: (id: BloggerDocumentId) => void;
}) {
  const { t } = useTranslation();
  const c = useColors();

  // One entry per requirement: an alternative group collapses to its first.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return documents.filter((id) => {
      const key = id === 'utility_bill' || id === 'premises_proof' ? 'address' : id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [documents]);

  return (
    <View className="gap-2">
      {rows.map((id) => {
        const group = id === 'utility_bill' || id === 'premises_proof';
        const held = documentSatisfied(application, id);
        return (
          <View key={id} className="flex-row items-center gap-3">
            <Ionicons
              name={held ? 'checkmark-circle' : 'document-outline'}
              size={18}
              color={held ? c.success : c.textMuted}
            />
            <Text variant="body-sm" className="flex-1">
              {t(`verify.document.${group ? 'address' : id}`)}
            </Text>
            {!disabled ? (
              <Button
                label={held ? t('verify.replace') : t('verify.attach')}
                variant="glass"
                size="sm"
                loading={busy === id}
                onPress={() => onPick(id)}
              />
            ) : held ? (
              <Text variant="caption" tone="success">
                {t('verify.attached')}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
