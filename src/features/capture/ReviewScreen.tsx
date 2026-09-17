import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import { Badge, Button, Chip, Glass, Pressable, Sheet, SwitchRow, Text } from '@/components/ui';
import { INCIDENT_CATEGORIES } from '@/types/api';
import { categoryColor, useColors } from '@/lib/theme';
import { formatExactCapture } from '@/lib/format';
import { hapticError, hapticSelect, hapticUnlock } from '@/lib/haptics';
import { plusCodeLabel } from '@/lib/plusCode';
import { useCaptureAddress } from '@/hooks/useCaptureAddress';
import { receiving, useOrganisations } from '@/hooks/useOrganisations';
import { OrganisationList } from '@/features/organisations/OrganisationList';
import { useCaptureStore } from '@/stores/captureStore';
import { useAuthStore } from '@/stores/authStore';
import { CapturePreview } from './CapturePreview';
import { PosterPicker } from './PosterPicker';
import { ConsentFields, SeverityField } from './ContextFields';
import { submitCapture } from './submitCapture';
import { DestinationPicker } from './DestinationPicker';
import { EarningsEstimate } from './EarningsEstimate';
import { toast } from '@/stores/toastStore';

/**
 * The steps of filing, in the order a reporter decides them.
 *
 *   1. What was captured, and what kind of report it is.
 *   2. What happened, how urgent it is, and whether it is published anonymously
 *      — the two sit together because both are about the reporter's position:
 *      how much danger, and how much exposure.
 *   3. Where it goes, and what the public sees of where it was.
 *
 * One long screen had people skipping past the end of it, which is where the
 * publishing choices lived.
 */
const BASE_STEPS = ['stepCapture', 'stepDetails', 'stepSend'] as const;

type Step = (typeof BASE_STEPS)[number] | 'stepRecipients';

/**
 * Naming the recipients is a fourth step, and only when there are recipients to
 * name.
 *
 * Choosing "send to specific organisations" used to open a half-height sheet on
 * top of this form, with its own search box and its own Done button — a second
 * screen pretending to be a control. Picking four newsrooms is a real task and
 * gets a real step: the same list, inline, with the wizard's own Back and Next
 * around it.
 */
const stepsFor = (directed: boolean): readonly Step[] =>
  directed ? [...BASE_STEPS, 'stepRecipients'] : BASE_STEPS;

/**
 * Review and metadata — the last screen before a report enters the queue.
 *
 * This is where the privacy guarantee is actually exercised, so the public
 * preview is not a nicety: a reporter deciding whether to publish footage of a
 * confrontation needs to see exactly what a stranger will see.
 */
export function ReviewScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);

  const {
    pending,
    category,
    description,
    isAnonymous,
    severity,
    consent,
    showLocation,
    showAddress,
    showDate,
    showTime,
    destination,
    businessIds,
    setDestination,
    setBusinessIds,
    setCategory,
    setDescription,
    setAnonymous,
    setSeverity,
    posterAtMs,
    setPosterAtMs,
    setConsent,
    reset,
  } = useCaptureStore();

  const [step, setStep] = useState(0);
  const [anonymitySheet, setAnonymitySheet] = useState(false);
  /*
   * Whether this reporter has an account. Truthful because `hydrate` drops a
   * profile no session supports.
   */
  const profile = useAuthStore((s) => s.profile);
  const [guestSheet, setGuestSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Whether the description has focus, so the way out of it can be offered. */
  const [describing, setDescribing] = useState(false);

  /*
   * Where it was filmed, in words: the street and plus code, and the address.
   * The plus code is worked out from the fix and needs no signal.
   */
  const place = useCaptureAddress(pending?.fix.latitude, pending?.fix.longitude);
  const plusCode = place.plusCode ? plusCodeLabel(place.plusCode, place.locality) : null;
  const locationLine = [place.street ?? place.locality, plusCode].filter(Boolean).join('  ·  ') || null;

  /*
   * The public preview.
   *
   * Computed from the same flags the payload carries, so the preview cannot
   * drift from what is actually published. It used to name "Kaneshie, Accra"
   * whatever the report — a placeholder in the one panel that promises to show
   * exactly what others will see.
   */
  const publicView = useMemo(() => {
    const iso = pending?.fix.capturedAtIso ?? null;
    return {
      place: showLocation ? (showAddress && place.address ? place.address : locationLine) : null,
      plusCode: showLocation && showAddress && place.address ? plusCode : null,
      time: showDate ? formatExactCapture(iso, showTime ? 'exact' : 'date_only') : null,
      publisher: isAnonymous ? t('common.anonymous') : t('review.yourName'),
    };
  }, [pending, showLocation, showAddress, showDate, showTime, isAnonymous, place.address, locationLine, plusCode, t]);

  /**
   * The reason this report cannot be sent yet, or null when it can.
   *
   * Only conditions the server will actually refuse. A description is required
   * by the API and was the one thing a reporter could leave out.
   */
  const blocker = useMemo(
    () => (description.trim().length === 0 ? t('review.needDescription') : null),
    [description, t],
  );

  /*
   * The organisations that can actually receive a report, for the recipients
   * step. The same live directory the destination step quotes rates from — a
   * reporter must not be offered a name that cannot be sent to.
   */
  const {
    data: directory,
    isPending: directoryPending,
    isError: directoryFailed,
  } = useOrganisations();
  const available = useMemo(() => receiving(directory), [directory]);
  const [recipientQuery, setRecipientQuery] = useState('');

  const toggleRecipient = useCallback(
    (id: string) =>
      setBusinessIds(
        businessIds.includes(id)
          ? businessIds.filter((existing) => existing !== id)
          : [...businessIds, id],
      ),
    [businessIds, setBusinessIds],
  );

  const steps = useMemo(() => stepsFor(destination === 'directed'), [destination]);
  /*
   * Changing the destination back from "specific organisations" removes the
   * fourth step underneath a reporter standing on it, so the index is clamped
   * rather than trusted.
   */
  const current = Math.min(step, steps.length - 1);

  /**
   * "Send to specific organisations" with nobody chosen sends the report
   * nowhere. Said here rather than discovered in the outbox.
   */
  const recipientsBlocker =
    destination === 'directed' && businessIds.length === 0 ? t('review.needRecipients') : null;

  /** Everything that has to be true before this report can be sent. */
  const sendBlocker = blocker ?? recipientsBlocker;

  const goTo = useCallback((next: number) => {
    Keyboard.dismiss();
    hapticSelect();
    setStep(next);
    // Each step starts at its top, not wherever the last one was scrolled to.
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    try {
      await submitCapture({
        clientId: Crypto.randomUUID(),
        capture: pending,
        category,
        description: description.trim(),
        isAnonymous,
        displayFlags: { showLocation, showAddress, showDate, showTime },
        place: { address: place.address, plusCode: place.plusCode?.full ?? null },
        severity,
        /*
         * The landmark field is gone from the review screen, so nothing is
         * typed here any more. The column and the payload field both stay —
         * `buildCreateRequest` omits an empty one rather than sending a blank —
         * so restoring the question later needs no migration.
         */
        landmark: '',
        posterAtMs,
        consent,
        // The reporter's decision about who sees this and whether it earns.
        destination,
        directedBusinessIds: businessIds,
      });
      hapticUnlock();
      reset();
      toast.success(t('review.queuedTitle'), t('review.queuedBody'));
      router.replace('/outbox');
    } catch (cause) {
      hapticError();
      // The empty-capture case has words of its own: the raw message is a sentinel.
      const empty = cause instanceof Error && cause.message === 'EMPTY_CAPTURE';
      toast.error(
        empty ? t('review.emptyCaptureTitle') : t('review.saveFailedTitle'),
        empty
          ? t('review.emptyCaptureBody')
          : cause instanceof Error
            ? cause.message
            : t('common.unknownErrorHelp'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    pending,
    submitting,
    category,
    description,
    isAnonymous,
    severity,
    posterAtMs,
    consent,
    // Load-bearing: omitted, the handler submits the destination from first render.
    destination,
    businessIds,
    showLocation,
    showAddress,
    showDate,
    showTime,
    place.address,
    place.plusCode,
    reset,
    router,
    t,
  ]);

  if (!pending) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-8">
        <Text variant="title-md">{t('review.nothingTitle')}</Text>
        <Text variant="body" tone="muted" className="text-center">
          {t('review.nothingBody')}
        </Text>
        <Button label={t('common.back')} variant="glass" onPress={() => router.back()} />
      </View>
    );
  }

  const last = current === steps.length - 1;

  /*
   * The keyboard covers the bottom of the screen, which is where a form's last
   * field and its buttons live. `padding` on iOS; Android's `adjustResize`
   * already does it.
   */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 140 }}
        contentContainerClassName="gap-5 px-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            // Back steps back through the review before it leaves it.
            onPress={() => (current > 0 ? goTo(current - 1) : router.back())}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-lg">{t('review.title')}</Text>
            <Text variant="caption" tone="muted">
              {t('review.stepOf', { step: current + 1, total: steps.length })} · {t(`review.${steps[current]}`)}
            </Text>
          </View>
        </View>

        {/* ── Steps ─────────────────────────────────────────────────────────── */}
        <View className="flex-row gap-2" accessibilityRole="progressbar">
          {steps.map((key, index) => {
            const done = index < current;
            const here = index === current;
            return (
              <Pressable
                key={key}
                // Only back to a step already passed: forward goes through Next,
                // which checks the description first.
                onPress={done ? () => goTo(index) : undefined}
                accessibilityLabel={t(`review.${key}`)}
                accessibilityState={{ selected: here }}
                className="flex-1 gap-1.5"
              >
                <View
                  className="h-1 rounded-pill"
                  style={{ backgroundColor: done || here ? c.accent : c.hairline, opacity: done || here ? 1 : 0.18 }}
                />
                <Text
                  variant="caption"
                  tone={here ? 'primary' : 'muted'}
                  className={here ? 'font-sans-semibold' : undefined}
                  numberOfLines={1}
                >
                  {index + 1}. {t(`review.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {current === 0 ? (
          <>
            {/* ── Live public preview ─────────────────────────────────────── */}
            <View className="gap-2">
              <Text variant="label" tone="muted">
                {t('review.previewLabel')}
              </Text>
              {/*
                Tall, and portrait-shaped: a capture is reviewed once, before it is
                committed to permanently, and the whole frame is what is reviewed.
              */}
              <View className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
                {/* Every kind of capture, each in an element that can render it. */}
                <CapturePreview uri={pending.uri} kind={pending.kind} />
                {/*
                  Not clickable, so the video controls underneath still are — this
                  strip sits exactly where a player puts its scrubber.
                */}
                <View
                  pointerEvents="none"
                  className="absolute bottom-0 left-0 right-0 gap-1.5 bg-black/55 p-3.5"
                >
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{ backgroundColor: categoryColor[category] }}
                      className="h-1.5 w-1.5 rounded-pill"
                    />
                    <Text variant="caption" onMedia className="font-sans-semibold uppercase">
                      {t(`category.${category}`)}
                    </Text>
                    {publicView.time ? (
                      <Text variant="caption" tone="muted" onMedia>
                        · {publicView.time}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="body-sm" onMedia numberOfLines={2}>
                    {description.trim() || t('review.noDescription')}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons
                      name={isAnonymous ? 'eye-off' : 'person'}
                      size={11}
                      color="rgba(255,255,255,0.8)"
                    />
                    <Text variant="caption" tone="muted" onMedia numberOfLines={2} className="flex-1">
                      {publicView.publisher}
                      {publicView.place ? `  ·  ${publicView.place}` : ''}
                      {publicView.plusCode ? `  ·  ${publicView.plusCode}` : ''}
                    </Text>
                  </View>
                </View>
              </View>
              <Text variant="caption" tone="muted">
                {t('review.previewHelp')}
              </Text>
            </View>

            {/* ── What happened ───────────────────────────────────────────── */}
            <View className="gap-2">
              <Text variant="label" tone="muted">
                {t('review.description')}
              </Text>
              <Glass elevation="low" className="rounded-lg p-3">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('review.descriptionPlaceholder')}
                  placeholderTextColor={c.textFaint}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  onFocus={() => setDescribing(true)}
                  onBlur={() => setDescribing(false)}
                  style={{
                    // No NativeWind equivalent survives multiline on both platforms.
                    color: c.textPrimary,
                    minHeight: 90,
                    textAlignVertical: 'top',
                    fontFamily: 'Inter_400Regular',
                    fontSize: 15,
                  }}
                  accessibilityLabel={t('review.description')}
                />
              </Glass>
              {/*
                A way out of a multiline field: return has to insert a newline, so
                the button is offered while it has focus.
              */}
              <View className="flex-row items-center justify-between">
                {describing ? (
                  <Pressable
                    onPress={() => Keyboard.dismiss()}
                    accessibilityLabel={t('common.done')}
                    className="rounded-pill bg-canvas-raise px-3 py-1.5"
                  >
                    <Text variant="caption" tone="accent" className="font-sans-semibold">
                      {t('common.done')}
                    </Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <Text variant="caption" tone="faint">
                  {description.length}/500
                </Text>
              </View>
            </View>

            {/*
              Only for footage, and only the reporter decides. A photograph is
              already its own thumbnail.
            */}
            {pending.kind === 'video' ? (
              <PosterPicker
                uri={pending.uri}
                durationMs={pending.durationMs}
                value={posterAtMs}
                onChange={setPosterAtMs}
              />
            ) : null}
          </>
        ) : null}

        {current === 1 ? (
          <>
            {/* ── Category ────────────────────────────────────────────────── */}
            <View className="gap-2">
              <Text variant="label" tone="muted">
                {t('review.category')}
              </Text>

              {/*
                Whistleblower is not one chip among fourteen.

                Every other category describes what the footage shows. This one
                changes what happens to the person who filed it — it turns
                anonymity on — and the people who need it are the least able to
                afford missing it in a wrapped row of look-alike chips. So it
                gets its own card, its own icon and its own colour, above the
                rest, where it cannot be skimmed past.
              */}
              <Pressable
                onPress={() => {
                  setCategory('whistleblower');
                  /*
                   * A whistleblower is usually identifiable by what they know, so
                   * choosing this turns anonymity on. It stays their choice below;
                   * this only changes the starting point.
                   */
                  setAnonymous(true);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === 'whistleblower' }}
                accessibilityLabel={t('category.whistleblower')}
              >
                <Glass
                  elevation="low"
                  raised={category === 'whistleblower'}
                  className={
                    category === 'whistleblower'
                      ? 'flex-row items-center gap-3 rounded-lg border-2 p-3.5'
                      : 'flex-row items-center gap-3 rounded-lg border border-hairline/[0.10] p-3.5'
                  }
                  style={
                    category === 'whistleblower'
                      ? {
                          borderColor: categoryColor.whistleblower,
                          backgroundColor: `${categoryColor.whistleblower}14`,
                        }
                      : undefined
                  }
                >
                  <View
                    className="h-10 w-10 items-center justify-center rounded-pill"
                    style={{ backgroundColor: `${categoryColor.whistleblower}22` }}
                  >
                    <Ionicons
                      name="shield-checkmark"
                      size={19}
                      color={categoryColor.whistleblower}
                    />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text variant="body" className="font-sans-semibold">
                      {t('category.whistleblower')}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('review.whistleblowerShort')}
                    </Text>
                  </View>
                  {category === 'whistleblower' ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={categoryColor.whistleblower}
                    />
                  ) : null}
                </Glass>
              </Pressable>

              <View className="flex-row flex-wrap gap-2">
                {INCIDENT_CATEGORIES.filter((key) => key !== 'whistleblower').map((key) => (
                  <Chip
                    key={key}
                    label={t(`category.${key}`)}
                    dotColor={categoryColor[key]}
                    selected={category === key}
                    onPress={() => setCategory(key)}
                  />
                ))}
              </View>

              {category === 'whistleblower' ? (
                <View className="flex-row items-start gap-2 rounded-md bg-canvas-raise p-3">
                  <Ionicons name="shield-checkmark-outline" size={16} color={c.accent} />
                  <Text variant="caption" tone="secondary" className="flex-1">
                    {t('review.whistleblowerNote')}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* ── How urgent, and publishing anonymously: one decision card ── */}
            <Glass elevation="low" className="gap-3 rounded-lg px-4 pt-4">
              <SeverityField severity={severity} onSeverity={setSeverity} />
              <View className="h-px bg-hairline/[0.08]" />
              <View>
                <SwitchRow
                  label={t('review.anonymous')}
                  description={t('review.anonymousShort')}
                  value={isAnonymous}
                  onValueChange={setAnonymous}
                />
                <Pressable
                  onPress={() => setAnonymitySheet(true)}
                  accessibilityLabel={t('review.whatThisMeans')}
                  className="flex-row items-center gap-1.5 pb-3.5"
                >
                  <Ionicons name="information-circle-outline" size={14} color={c.accent} />
                  <Text variant="caption" tone="accent" className="font-sans-semibold">
                    {t('review.whatThisMeans')}
                  </Text>
                </Pressable>
              </View>
            </Glass>

            <ConsentFields consent={consent} onConsent={setConsent} />
          </>
        ) : null}

        {current === 2 ? (
          <>
            {/* ── Where it goes ───────────────────────────────────────────── */}
            <DestinationPicker
              destination={destination}
              onChange={setDestination}
              selectedOrganisationIds={businessIds}
              category={category}
              mediaKind={pending.kind}
              locationConfidence={pending.confidence}
            />

            {/*
              Where it was filmed, the landmark question, and the four switches
              deciding what the public sees are all gone from this screen.

              They asked somebody to recall, after the fact, what they had just
              been looking at — and the answer is now shown on the camera while
              the shot is framed, which is the moment it can still change what
              gets filmed. Place, address, date and time publish with every
              report; `displayFlags` still carries them and the store still holds
              them, so restoring the choice is a matter of rendering switches
              again rather than a migration.
            */}
            {pending.confidence === 'low' ? (
              <Badge label={t('capture.reducedAccuracyBadge')} tone="warning" />
            ) : null}
          </>
        ) : null}

        {/* ── Who receives it ─────────────────────────────────────────────── */}
        {current === 3 ? (
          <>
            <View className="gap-1">
              <Text variant="label" tone="muted">
                {t('destination.chooseOrganisations')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('destination.chooseOrganisationsHelp')}
              </Text>
            </View>
            {/*
              The list itself, not a button that opens one. It scrolls with the
              rest of the step, so the keyboard and the Next button behave the
              way they do on every other step.
            */}
            <OrganisationList
              organisations={available}
              query={recipientQuery}
              onQuery={setRecipientQuery}
              mode="multi"
              selectedIds={businessIds}
              onChoose={toggleRecipient}
              loading={directoryPending}
              failed={directoryFailed}
              emptyBody={t('destination.noOrganisationsBody')}
            />

            {/*
              The money, under the choice that decides it.

              It used to sit on step three, where nothing had been chosen yet —
              so it quoted one licensee and no organisation's offer, and a
              reporter picked four newsrooms without ever seeing what that was
              worth. Here it moves with every tick above it.
            */}
            <EarningsEstimate
              category={category}
              destination={destination}
              mediaKind={pending.kind}
              locationConfidence={pending.confidence}
              selectedOrganisationIds={businessIds}
            />
          </>
        ) : null}
      </ScrollView>

      {/* Submit */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {/*
          Said here, not discovered in the outbox. The server rejects an empty
          description, and that used to arrive minutes later as "Request
          validation failed" on a row in the queue.
        */}
        {current >= 1 && (blocker ?? (current === 3 ? recipientsBlocker : null)) ? (
          <Text variant="caption" tone="muted" className="mb-2 text-center">
            {blocker ?? recipientsBlocker}
          </Text>
        ) : null}
        {/*
          Back and Next carry the same weight.

          Next was `flex-[2]` against Back's `flex-1`, so going forward was a
          button twice the size of going back — a thumb reaching for Back on a
          five-step form found the smaller target every time, on the screen where
          stepping back is how somebody corrects a mistake before it is filed.
        */}
        <View className="flex-row gap-2">
          {current > 0 ? (
            <Button
              label={t('common.back')}
              variant="glass"
              size="lg"
              className="flex-1"
              onPress={() => goTo(current - 1)}
            />
          ) : null}
          {last ? (
            <Button
              label={t('review.submit')}
              size="lg"
              className="flex-1"
              loading={submitting}
              // Nothing can be sent without a description, and a directed report
              // cannot be sent without somebody to send it to.
              disabled={sendBlocker !== null}
              /*
                A guest is asked before the report leaves, not told afterwards:
                once it has uploaded under a device identity there is no account
                to attach it to.
              */
              onPress={() => (profile ? void handleSubmit() : setGuestSheet(true))}
            />
          ) : (
            <Button
              label={t('review.next')}
              size="lg"
              className="flex-1"
              // The description is on step 1 now, with the capture it describes.
              disabled={current === 0 && blocker !== null}
              onPress={() => goTo(current + 1)}
            />
          )}
        </View>
      </View>

      {/*
        Sending without an account.

        Not a blocker and not a nag: filing anonymously is a first-class way to
        use this app. What they are owed is the consequence, stated once — no
        tracking, no payment — and that it is still reversible while the report
        sits in the outbox.
      */}
      <Sheet
        visible={guestSheet}
        onClose={() => setGuestSheet(false)}
        title={t('review.guestSheetTitle')}
      >
        <View className="gap-3">
          <Text variant="body" tone="secondary">
            {t('review.guestSheetBody')}
          </Text>
          <Text variant="body" tone="secondary">
            {t('review.guestSheetKeep')}
          </Text>

          {/* Signing in leads, because it keeps their options open. Sending stays a
              full-width second choice: a legitimate decision, not the wrong answer. */}
          <Button
            label={t('review.guestSheetSignIn')}
            fullWidth
            className="mt-2"
            onPress={() => {
              setGuestSheet(false);
              // Nothing is reset until a submission succeeds, so the review survives.
              router.push('/(auth)/sign-in');
            }}
          />
          <Button
            label={t('review.guestSheetSend')}
            variant="glass"
            fullWidth
            onPress={() => {
              setGuestSheet(false);
              void handleSubmit();
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={anonymitySheet}
        onClose={() => setAnonymitySheet(false)}
        title={t('review.anonymitySheetTitle')}
      >
        <View className="gap-3">
          <Text variant="body" tone="secondary">
            {t('review.anonymitySheetBody')}
          </Text>
          <Text variant="body" tone="secondary">
            {t('review.anonymitySheetDevice')}
          </Text>
          <Button label={t('common.done')} className="mt-2" onPress={() => setAnonymitySheet(false)} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
