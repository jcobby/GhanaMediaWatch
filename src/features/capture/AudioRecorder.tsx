import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { hapticSelect, hapticUnlock } from '@/lib/haptics';
import { toast } from '@/stores/toastStore';
import type { LockedFix } from './gpsGate';

/** Long enough for an account of an incident; short enough to upload on 3G. */
const MAX_SECONDS = 180;

/**
 * Recording spoken evidence.
 *
 * The third capture type, and the one that works when the other two do not.
 * Filming a confrontation can be the thing that starts one; describing it
 * afterwards, from somewhere safe, carries no such risk. It is also the only
 * mode that works in the dark, in a crowd, or in a pocket.
 *
 * Audio takes the same GPS lock as everything else. Provenance is the product,
 * and a recording without a fix would be an exception in the one place the
 * platform cannot afford exceptions — so this screen is only reachable once the
 * gate has passed, and the fix is stamped on the recording exactly as it is on
 * a video.
 */
export function AudioRecorder({
  fix,
  onDiscard,
  onKeep,
}: {
  fix: LockedFix;
  onDiscard: () => void;
  onKeep: (uri: string, durationMs: number) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const [granted, setGranted] = useState<boolean | null>(null);
  const [finishedUri, setFinishedUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const permission = await requestRecordingPermissionsAsync();
      if (cancelled) return;
      setGranted(permission.granted);
      if (permission.granted) {
        // Recording must survive the screen locking mid-sentence.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);
  const remaining = MAX_SECONDS - seconds;

  // Stopped at the cap rather than truncated on upload, so a reporter is never
  // told afterwards that the end of their account was thrown away.
  useEffect(() => {
    if (state.isRecording && remaining <= 0) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording, remaining]);

  const start = async () => {
    hapticSelect();
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      toast.error(t('audio.failedTitle'), t('audio.failedBody'));
    }
  };

  const stop = async () => {
    try {
      await recorder.stop();
      hapticUnlock();
      if (recorder.uri) setFinishedUri(recorder.uri);
    } catch {
      toast.error(t('audio.failedTitle'), t('audio.failedBody'));
    }
  };

  if (granted === false) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Ionicons name="mic-off-outline" size={26} color={c.textMuted} />
        <Text variant="title-sm" className="text-center">
          {t('audio.permissionTitle')}
        </Text>
        <Text variant="body-sm" tone="muted" className="text-center">
          {t('audio.permissionBody')}
        </Text>
        <Button label={t('common.back')} variant="glass" onPress={onDiscard} className="mt-2" />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-6 px-8">
      <View className="items-center gap-1.5">
        <Text variant="display-lg" className="tabular font-display">
          {format(seconds)}
        </Text>
        <Text variant="caption" tone={remaining <= 20 ? 'warning' : 'muted'}>
          {state.isRecording
            ? t('audio.remaining', { seconds: Math.max(0, remaining) })
            : t('audio.maxLength', { seconds: MAX_SECONDS })}
        </Text>
      </View>

      {/* The same fix that gates the camera, shown so it is obvious the
          recording carries provenance rather than being a loose voice note. */}
      <Glass elevation="low" className="w-full flex-row items-center gap-2.5 rounded-lg p-3">
        <Ionicons name="location" size={14} color={c.success} />
        <Text variant="caption" tone="muted" className="flex-1">
          {t('audio.stamped', { accuracy: Math.round(fix.accuracyM) })}
        </Text>
      </Glass>

      {finishedUri ? (
        <View className="w-full gap-2">
          <Button
            label={t('audio.keep')}
            size="lg"
            fullWidth
            onPress={() => onKeep(finishedUri, seconds * 1000)}
            leading={<Ionicons name="checkmark" size={16} color={c.textOnDark} />}
          />
          <Button
            label={t('audio.recordAgain')}
            variant="glass"
            fullWidth
            onPress={() => {
              setFinishedUri(null);
            }}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => void (state.isRecording ? stop() : start())}
          disabled={granted === null}
          accessibilityLabel={state.isRecording ? t('audio.stop') : t('audio.start')}
          className="items-center justify-center"
        >
          <View
            className={
              state.isRecording
                ? 'h-20 w-20 items-center justify-center rounded-pill bg-live'
                : 'h-20 w-20 items-center justify-center rounded-pill bg-accent'
            }
          >
            <Ionicons name={state.isRecording ? 'stop' : 'mic'} size={30} color={c.textOnDark} />
          </View>
        </Pressable>
      )}

      {!finishedUri ? (
        <Pressable onPress={onDiscard} haptic={false} accessibilityLabel={t('common.cancel')}>
          <Text variant="body-sm" tone="muted">
            {t('common.cancel')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function format(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
