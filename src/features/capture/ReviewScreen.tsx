import { useCallback, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import { Badge, Button, Chip, Glass, Pressable, Sheet, SwitchRow, Text } from '@/components/ui';
import { INCIDENT_CATEGORIES } from '@/types/api';
import { categoryColor, colors } from '@/lib/theme';
import { formatExactCapture } from '@/lib/format';
import { hapticError, hapticUnlock } from '@/lib/haptics';
import { useCaptureStore } from '@/stores/captureStore';
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
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    pending,
    category,
    description,
    isAnonymous,
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
    setShowLocation,
    setShowDate,
    setShowTime,
    reset,
  } = useCaptureStore();

  const [anonymitySheet, setAnonymitySheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      });
      hapticUnlock();
      reset();
      toast.success(t('review.queuedTitle'), t('review.queuedBody'));
      router.replace('/outbox');
    } catch (cause) {
      hapticError();
      toast.error(
        t('review.saveFailedTitle'),
        cause instanceof Error ? cause.message : t('common.unknownErrorHelp'),
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

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120 }}
        contentContainerClassName="gap-5 px-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text variant="title-lg">{t('review.title')}</Text>
        </View>

        {/* ── Live public preview ─────────────────────────────────────────── */}
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t('review.previewLabel')}
          </Text>
          <View className="h-72 overflow-hidden rounded-lg bg-canvas-raise">
            <Image
              source={{ uri: pending.uri }}
              style={{ position: 'absolute', inset: 0 }}
              contentFit="cover"
              transition={180}
            />
            <View className="absolute bottom-0 left-0 right-0 gap-1.5 bg-black/55 p-3.5">
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
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={4}
              maxLength={500}
              style={{
                // TextInput's own text colour and min height have no NativeWind
                // equivalent that survives multiline on both platforms.
                color: colors.textPrimary,
                minHeight: 90,
                textAlignVertical: 'top',
                fontFamily: 'Inter_400Regular',
                fontSize: 15,
              }}
              accessibilityLabel={t('review.description')}
            />
          </Glass>
          <Text variant="caption" tone="faint" className="self-end">
            {description.length}/500
          </Text>
        </View>

        {/* ── Where it goes ───────────────────────────────────────────────── */}
        <DestinationPicker
          destination={destination}
          onChange={setDestination}
          selectedBusinessIds={businessIds}
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
            <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
            <Text variant="caption" tone="accent" className="font-sans-semibold">
              {t('review.whatThisMeans')}
            </Text>
          </Pressable>
        </Glass>

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
            <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
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
        <Button
          label={t('review.submit')}
          fullWidth
          size="lg"
          loading={submitting}
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
    </View>
  );
}
