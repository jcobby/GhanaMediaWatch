import { useCallback, useMemo, useState } from 'react';
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
import { hapticError, hapticUnlock } from '@/lib/haptics';
import { useCaptureStore } from '@/stores/captureStore';
import { CapturePreview } from './CapturePreview';
import { PosterPicker } from './PosterPicker';
import { ContextFields } from './ContextFields';
import { submitCapture } from './submitCapture';
import { DestinationPicker } from './DestinationPicker';
import { toast } from '@/stores/toastStore';

/**
 * Review and metadata — the last screen before a report enters the queue.
 *
 * This is where the privacy guarantee is actually exercised, so the public
 * preview is not a nicety: a reporter deciding whether to publish footage of a
 * confrontation needs to see exactly what a stranger will see, not a list of
 * toggles they have to mentally simulate.
 */
export function ReviewScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    pending,
    category,
    description,
    isAnonymous,
    severity,
    landmark,
    consent,
    showLocation,
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
    setLandmark,
    posterAtMs,
    setPosterAtMs,
    setConsent,
    setShowLocation,
    setShowDate,
    setShowTime,
    reset,
  } = useCaptureStore();

  const [anonymitySheet, setAnonymitySheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Whether the description has focus, so the way out of it can be offered. */
  const [describing, setDescribing] = useState(false);

  /*
   * The public preview.
   *
   * Computed from the same flags the payload carries, so the preview cannot
   * drift from what is actually published — deriving it separately is how a
   * "what others see" panel ends up lying.
   */
  const publicView = useMemo(() => {
    const iso = pending?.fix.capturedAtIso ?? null;
    return {
      place: showLocation ? 'Kaneshie, Accra' : null,
      time: showDate ? formatExactCapture(iso, showTime ? 'exact' : 'date_only') : null,
      publisher: isAnonymous ? t('common.anonymous') : t('review.yourName'),
    };
  }, [pending, showLocation, showDate, showTime, isAnonymous, t]);

  /**
   * The reason this report cannot be sent yet, or null when it can.
   *
   * Only conditions the server will actually refuse — this is not a place to
   * invent house style. A description is required by the API and was the one
   * thing a reporter could leave out and still press submit.
   */
  const blocker = useMemo(
    () => (description.trim().length === 0 ? t('review.needDescription') : null),
    [description, t],
  );

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
        displayFlags: { showLocation, showDate, showTime },
        severity,
        landmark,
        posterAtMs,
        consent,
        // The picker above is the reporter's decision about who sees this and
        // whether it earns. It used to stop at this screen.
        destination,
        directedBusinessIds: businessIds,
      });
      hapticUnlock();
      reset();
      toast.success(t('review.queuedTitle'), t('review.queuedBody'));
      router.replace('/outbox');
    } catch (cause) {
      hapticError();
      // The empty-capture case has words of its own: the raw message is a
      // sentinel, and the reporter needs to be told to film it again rather
      // than shown "EMPTY_CAPTURE".
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
    landmark,
    posterAtMs,
    consent,
    // Load-bearing, not housekeeping: omitted, the handler closes over the
    // destination as it was on first render, so a reporter who changes their
    // mind submits the old choice and is told the new one was saved.
    destination,
    businessIds,
    showLocation,
    showDate,
    showTime,
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

  /*
   * The keyboard covers the bottom of the screen, which is where a form's last
   * field and its submit button live. Every screen here that takes typed input
   * needs this; only the sign-in screens had it, so the rest hid the control
   * you were reaching for the moment you tapped to type.
   *
   * `padding` on iOS, matching the sign-in screens. Left unset on Android,
   * where the window resizing under `adjustResize` already does it — the
   * exception is a `Modal`, which that does not reach, and which `Sheet`
   * handles itself.
   */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120 }}
        contentContainerClassName="gap-5 px-4"
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
          <Text variant="title-lg">{t('review.title')}</Text>
        </View>

        {/* ── Live public preview ─────────────────────────────────────────── */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('review.previewLabel')}
          </Text>
          {/*
            Tall, and portrait-shaped.

            This was a 288px landscape box with the media cropped to fill it, so
            a reporter reviewing a portrait phone video saw a letterbox slice
            through the middle of their own footage and had to send it without
            ever seeing the top or the bottom. A capture is reviewed once,
            before it is committed to permanently, and the whole frame is the
            thing being reviewed.
          */}
          <View className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
            {/*
              Every kind of capture, each in an element that can render it.

              This was one `expo-image` for all of them, and `expo-image` cannot
              decode an MP4 — it fails silently, so a video report showed an
              empty grey box directly under "This is exactly how your report
              appears to other people". A reporter could not check their own
              footage, and could not tell a blank preview from a failed
              recording.
            */}
            <CapturePreview uri={pending.uri} kind={pending.kind} />
            {/*
              Not clickable, so the video controls underneath still are.

              This strip sits at the bottom of the frame, which is exactly where
              a player puts its scrubber — and it would otherwise swallow every
              tap meant for it, leaving a reporter unable to play the clip they
              are being asked to review.
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
                <Text variant="caption" tone="muted" onMedia>
                  {publicView.publisher}
                  {publicView.place ? `  ·  ${publicView.place}` : ''}
                </Text>
              </View>
            </View>
          </View>
          <Text variant="caption" tone="muted">
            {t('review.previewHelp')}
          </Text>
        </View>

        {/* ── Category ────────────────────────────────────────────────────── */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('review.category')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {INCIDENT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(`category.${c}`)}
                dotColor={categoryColor[c]}
                selected={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </View>
        </View>

        {/* ── Thumbnail ───────────────────────────────────────────────────── */}
        {/*
          Only for footage, and only the reporter decides.

          A photograph is already its own thumbnail. A clip is not, and the
          frame the app would otherwise take — one second in — is often the
          phone still being raised. The person who filmed it is the only one who
          knows which second shows the thing.
        */}
        {pending.kind === 'video' ? (
          <PosterPicker
            uri={pending.uri}
            durationMs={pending.durationMs}
            value={posterAtMs}
            onChange={setPosterAtMs}
          />
        ) : null}

        {/* ── Description ─────────────────────────────────────────────────── */}
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
                // TextInput's own text colour and min height have no NativeWind
                // equivalent that survives multiline on both platforms.
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
            A way out of a multiline field.

            A single-line input can offer "Done" on the return key. This one
            cannot: return has to insert a newline, so the only escapes are
            scrolling — `keyboardDismissMode` above — or tapping somewhere
            harmless. Neither is discoverable while the keyboard is covering the
            submit button, which reporters hit as being unable to file at all.
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

        {/* ── Where it goes ───────────────────────────────────────────────── */}
        <DestinationPicker
          destination={destination}
          onChange={setDestination}
          selectedOrganisationIds={businessIds}
          onChangeBusinesses={setBusinessIds}
          category={category}
          mediaKind={pending.kind}
          locationConfidence={pending.confidence}
        />

        {/* ── Anonymity ───────────────────────────────────────────────────── */}
        <Glass elevation="low" className="rounded-lg px-4">
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
        </Glass>

        <ContextFields
          severity={severity}
          onSeverity={setSeverity}
          landmark={landmark}
          onLandmark={setLandmark}
          consent={consent}
          onConsent={setConsent}
        />

        {/* ── Display toggles ─────────────────────────────────────────────── */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('review.whatToPublish')}
          </Text>
          <Glass elevation="low" className="rounded-lg px-4">
            <SwitchRow
              label={t('review.showLocation')}
              description={t('review.showLocationHelp')}
              value={showLocation}
              onValueChange={setShowLocation}
            />
            <SwitchRow
              label={t('review.showDate')}
              description={t('review.showDateHelp')}
              value={showDate}
              onValueChange={setShowDate}
            />
            <SwitchRow
              label={t('review.showTime')}
              description={t('review.showTimeHelp')}
              value={showTime}
              // A bare time with no date is meaningless yet still narrows the
              // window, so the control is disabled rather than left to produce
              // a misleading half-private state.
              disabled={!showDate}
              onValueChange={setShowTime}
            />
          </Glass>
          <View className="flex-row items-start gap-2">
            <Ionicons name="lock-closed-outline" size={13} color={c.textMuted} />
            <Text variant="caption" tone="muted" className="flex-1">
              {t('review.storedRegardless')}
            </Text>
          </View>
        </View>

        {pending.confidence === 'low' ? (
          <Badge label={t('capture.reducedAccuracyBadge')} tone="warning" />
        ) : null}
      </ScrollView>

      {/* Submit */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {/*
          Said here, not discovered in the outbox.

          The server requires at least one character of description and rejects
          the whole submission without it. That rejection used to arrive minutes
          later as "Request validation failed" on a row in the queue, by which
          point the reporter had left the scene and had no idea which of their
          answers was the problem — or that a single word would have fixed it.
        */}
        {blocker ? (
          <Text variant="caption" tone="muted" className="mb-2 text-center">
            {blocker}
          </Text>
        ) : null}
        <Button
          label={t('review.submit')}
          fullWidth
          size="lg"
          loading={submitting}
          disabled={blocker !== null}
          onPress={() => void handleSubmit()}
        />
      </View>

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
          <Button
            label={t('common.done')}
            className="mt-2"
            onPress={() => setAnonymitySheet(false)}
          />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
