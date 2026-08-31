import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { MAX_VIDEO_DURATION_S } from '@/lib/constants';
import { colors } from '@/lib/theme';
import { hapticPress, hapticRecord, hapticWarning } from '@/lib/haptics';
import { useCaptureStore } from '@/stores/captureStore';
import { lockFix, type LocationFix } from './gpsGate';
import { AudioRecorder } from './AudioRecorder';

interface CameraStageProps {
  fix: LocationFix;
  confidence: 'high' | 'low';
  accuracyM: number;
}

/**
 * What the shutter does.
 *
 * `live` is offered but not yet implemented — it is on the switch so the
 * intent is visible and so the layout is settled before it arrives, and it
 * explains itself rather than doing nothing when tapped.
 */
type Mode = 'photo' | 'video' | 'audio' | 'live';

/**
 * The camera, mounted only once the GPS gate has opened.
 *
 * `expo-camera` rather than `react-native-vision-camera`: Vision Camera is a
 * custom native module, which Expo Go cannot load on any SDK. Since iOS testing
 * here depends on Expo Go — no Mac available — the finer format and frame
 * control Vision Camera offers is not worth losing the ability to run the app
 * at all. Everything the brief requires (photo, video, hold-to-record, torch,
 * flip, duration cap) is supported.
 */
export function CameraStage({ fix, confidence, accuracyM }: CameraStageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  const [mode, setMode] = useState<Mode>('photo');
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  // Live is on the switch but not built yet; tapping it explains itself
  // rather than selecting a mode whose shutter would do nothing.
  const [liveSheet, setLiveSheet] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const [busy, setBusy] = useState(false);

  const setPending = useCaptureStore((s) => s.setPending);

  // Recording timer, and the client-side duration cap.
  useEffect(() => {
    if (!recording) {
      setElapsedS(0);
      return;
    }
    const id = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (recording && elapsedS >= MAX_VIDEO_DURATION_S) {
      hapticWarning();
      cameraRef.current?.stopRecording();
    }
  }, [recording, elapsedS]);

  const handlePhoto = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    hapticPress();
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (!photo) return;
      setPending({
        uri: photo.uri,
        kind: 'photo',
        mimeType: 'image/jpeg',
        width: photo.width,
        height: photo.height,
        durationMs: null,
        // Locked here, at the shutter — not re-read on the review screen. A
        // reporter who walks away before submitting must not have their report
        // stamped with wherever they ended up.
        fix: lockFix(fix),
        confidence,
      });
      router.push('/capture/review');
    } finally {
      setBusy(false);
    }
  }, [busy, fix, confidence, setPending, router]);

  const handleVideoStart = useCallback(async () => {
    if (busy || recording) return;
    hapticRecord();
    setRecording(true);
    try {
      const video = await cameraRef.current?.recordAsync({
        maxDuration: MAX_VIDEO_DURATION_S,
      });
      if (!video) return;
      setPending({
        uri: video.uri,
        kind: 'video',
        mimeType: 'video/mp4',
        width: null,
        height: null,
        durationMs: elapsedS * 1000,
        fix: lockFix(fix),
        confidence,
      });
      router.push('/capture/review');
    } finally {
      setRecording(false);
    }
  }, [busy, recording, elapsedS, fix, confidence, setPending, router]);

  const handleVideoStop = useCallback(() => {
    if (!recording) return;
    hapticRecord();
    cameraRef.current?.stopRecording();
  }, [recording]);

  // Permissions. Video needs the microphone too — footage of an incident
  // without its audio loses most of its evidential value.
  const needsPermission =
    !cameraPermission?.granted || (mode === 'video' && !micPermission?.granted);

  if (needsPermission) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-accent-wash">
          <Ionicons name="camera-outline" size={28} color={colors.accent} />
        </View>
        <Text variant="title-md" className="text-center">
          {t('capture.cameraPermissionTitle')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {t('capture.cameraPermissionBody')}
        </Text>
        <Button
          label={t('capture.grantAccess')}
          onPress={() => {
            void requestCamera();
            void requestMic();
          }}
        />
      </View>
    );
  }

  const ringProgress = Math.min(1, elapsedS / MAX_VIDEO_DURATION_S);

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        enableTorch={torch}
        mode={mode === 'video' ? 'video' : 'picture'}
      />

      {/* Persistent GPS pill — the gate's state stays visible while filming. */}
      <View className="absolute left-4 flex-row gap-2" style={{ top: insets.top + 10 }}>
        <Glass
          context="media"
          elevation="mid"
          className="flex-row items-center gap-2 rounded-pill px-3 py-1.5"
        >
          <View
            className={
              confidence === 'low'
                ? 'h-1.5 w-1.5 rounded-pill bg-warning'
                : 'h-1.5 w-1.5 rounded-pill bg-success'
            }
          />
          <Text variant="caption" className="font-sans-semibold" onMedia>
            ±{Math.round(accuracyM)} m
          </Text>
        </Glass>
        {fix.isMocked ? (
          <Glass context="media" elevation="mid" className="rounded-pill px-3 py-1.5">
            <Text variant="caption" tone="warning" onMedia className="font-sans-semibold">
              {t('capture.mockedShort')}
            </Text>
          </Glass>
        ) : null}
      </View>

      {/* Torch and flip */}
      <View className="absolute right-4 gap-3" style={{ top: insets.top + 10 }}>
        <Pressable
          onPress={() => setTorch((v) => !v)}
          accessibilityLabel={t('capture.torch')}
          className="h-11 w-11 items-center justify-center rounded-pill bg-glass-media/50"
        >
          <Ionicons
            name={torch ? 'flashlight' : 'flashlight-outline'}
            size={20}
            color={torch ? colors.warning : colors.textOnDark}
          />
        </Pressable>
        <Pressable
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          accessibilityLabel={t('capture.flip')}
          className="h-11 w-11 items-center justify-center rounded-pill bg-glass-media/50"
        >
          <Ionicons name="camera-reverse-outline" size={20} color={colors.textOnDark} />
        </Pressable>
      </View>

      {/* Recording timer */}
      {recording ? (
        <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 60 }}>
          <Glass
            context="media"
            elevation="high"
            className="flex-row items-center gap-2 rounded-pill px-3.5 py-2"
          >
            <View className="h-2 w-2 rounded-pill bg-live" />
            <Text variant="body-sm" className="font-sans-semibold" onMedia>
              {String(Math.floor(elapsedS / 60)).padStart(2, '0')}:
              {String(elapsedS % 60).padStart(2, '0')} / {MAX_VIDEO_DURATION_S}s
            </Text>
          </Glass>
        </View>
      ) : null}

      {mode === 'audio' ? (
        <View className="absolute inset-0 bg-canvas">
          <AudioRecorder
            fix={lockFix(fix)}
            onDiscard={() => setMode('video')}
            onKeep={(uri, durationMs) => {
              setPending({
                uri,
                kind: 'audio',
                mimeType: 'audio/m4a',
                width: null,
                height: null,
                durationMs,
                fix: lockFix(fix),
                confidence,
              });
              router.push('/capture/review');
            }}
          />
        </View>
      ) : null}

      {/* Mode switch + shutter */}
      <View
        className="absolute left-0 right-0 items-center gap-5"
        style={{ bottom: insets.bottom + 96 }}
      >
        {!recording ? (
          <Glass context="media" elevation="mid" className="flex-row rounded-pill p-1">
            {(['photo', 'video', 'audio', 'live'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  if (m === 'live') {
                    setLiveSheet(true);
                    return;
                  }
                  setMode(m);
                }}
                accessibilityLabel={t(`capture.${m}`)}
                accessibilityState={{ selected: mode === m }}
                className={
                  mode === m ? 'rounded-pill bg-glass/25 px-4 py-2' : 'rounded-pill px-4 py-2'
                }
              >
                <Text
                  variant="body-sm"
                  onMedia
                  tone={mode === m ? 'primary' : 'muted'}
                  className="font-sans-semibold"
                >
                  {t(`capture.${m}`)}
                </Text>
              </Pressable>
            ))}
          </Glass>
        ) : null}

        {mode !== 'audio' ? (
          <Pressable
            onPress={mode === 'photo' ? handlePhoto : undefined}
            onLongPress={mode === 'video' ? handleVideoStart : undefined}
            onPressOut={mode === 'video' && recording ? handleVideoStop : undefined}
            delayLongPress={180}
            haptic={false}
            disabled={busy}
            accessibilityLabel={mode === 'video' ? t('capture.holdToRecord') : t('capture.photo')}
            className="h-20 w-20 items-center justify-center rounded-pill border-4 border-white/70"
          >
            {/* Ring countdown: the border fills as the cap approaches. */}
            {recording ? (
              <View
                className="absolute inset-0 rounded-pill border-4 border-live"
                style={{ opacity: 0.35 + ringProgress * 0.65 }}
              />
            ) : null}
            <View
              className={
                recording ? 'h-7 w-7 rounded-sm bg-live' : 'h-16 w-16 rounded-pill bg-white'
              }
            />
          </Pressable>
        ) : null}

        {mode === 'video' && !recording ? (
          <Text variant="caption" onMedia tone="muted">
            {t('capture.holdToRecord')}
          </Text>
        ) : null}
      </View>

      <Sheet visible={liveSheet} onClose={() => setLiveSheet(false)} title={t('capture.liveTitle')}>
        <Text variant="body-sm" tone="secondary">
          {t('capture.liveBody')}
        </Text>
        <Button
          label={t('capture.liveGotIt')}
          fullWidth
          className="mt-4"
          onPress={() => {
            setMode('video');
            setLiveSheet(false);
          }}
        />
      </Sheet>
    </View>
  );
}
