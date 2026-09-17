import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { MAX_VIDEO_DURATION_S, MIN_VIDEO_DURATION_S } from '@/lib/constants';
import { colors } from '@/lib/theme';
import { hapticPress, hapticRecord, hapticWarning } from '@/lib/haptics';
import { useCaptureStore } from '@/stores/captureStore';
import { useCaptureAddress } from '@/hooks/useCaptureAddress';
import { plusCodeLabel } from '@/lib/plusCode';
import { toast } from '@/stores/toastStore';
import { setCameraActive } from '@/lib/mediaSession';
import { lockFix, type LocationFix } from './gpsGate';
import { AudioRecorder } from './AudioRecorder';

interface CameraStageProps {
  fix: LocationFix;
  confidence: 'high' | 'low';
  accuracyM: number;
}

/**
 * What the file actually is, from the name the recorder gave it.
 *
 * This was hardcoded to `video/mp4` for every recording. `expo-camera` writes
 * MP4 on Android and QuickTime on iOS, so every iPhone clip was uploaded
 * declaring a container it is not: verified on the live service, a stored
 * recording begins `ftypqt` — the QuickTime brand — while its record says
 * `video/mp4`.
 *
 * Browsers mostly cope, because the codecs inside are the same H.264 and AAC.
 * "Mostly" is the problem: it is a claim about the bytes that is simply untrue,
 * it is what a strict player rejects, and it is the sort of mismatch that
 * surfaces as "the video does not work" on one device and nowhere else.
 *
 * Anything unrecognised stays `video/mp4`, which is what it was before and the
 * right guess for a camera file.
 *
 * The codec is appended where the recorder reported one. See below for why the
 * container on its own cannot answer the question anybody actually has, which
 * is whether the footage will play.
 */
function videoMimeType(uri: string, codec?: string): string {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  const container =
    extension === 'mov' || extension === 'qt'
      ? 'video/quicktime'
      : extension === 'webm'
        ? 'video/webm'
        : 'video/mp4';

  /*
   * The codec, where the recorder told us, because the container alone is not
   * enough to know whether anybody can play this.
   *
   * An iPhone's `.mov` holding H.264 opens anywhere once relabelled; the same
   * `.mov` holding HEVC opens in no desktop browser at all, and the two are
   * indistinguishable from the filename. `recordAsync` resolves with `codec` on
   * iOS — `avc1` for H.264, `hvc1` for HEVC — so the report can say which it is
   * instead of leaving the desk to discover it as a black rectangle.
   *
   * The parameter form is what `<video>` and every strict player read. Omitted
   * when the recorder said nothing, because a guessed codec is worse than none.
   */
  if (codec === 'avc1') return `${container}; codecs=avc1`;
  if (codec === 'hvc1') return `${container}; codecs=hvc1`;
  return container;
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
 * How long "Saving…" may last before the recording is treated as lost.
 *
 * A healthy stop finalises in well under a second. One that has not arrived
 * after this long belongs to a capture session iOS already cut off, and it will
 * never arrive: the screen used to sit on "Saving…" forever.
 */
const SAVE_TIMEOUT_MS = 6000;

/**
 * The camera, mounted only once the GPS gate has opened.
 *
 * `expo-camera` rather than `react-native-vision-camera`: Vision Camera is a
 * custom native module, which Expo Go cannot load on any SDK. Since iOS testing
 * here depends on Expo Go — no Mac available — the finer format and frame
 * control Vision Camera offers is not worth losing the ability to run the app
 * at all. Everything the brief requires (photo, video, torch, flip,
 * duration cap) is supported.
 */
export function CameraStage({ fix, confidence, accuracyM }: CameraStageProps) {
  const { t } = useTranslation();

  /*
   * Where and when, on the viewfinder.
   *
   * These four values — place, address, date, time — used to be switches on the
   * review screen, decided after the fact against a memory of where you had
   * been. They are published with every report now, so the honest place to show
   * them is while the shot is still being framed: a reporter can see exactly
   * what the footage will carry before pressing the shutter, and step away if it
   * says more than they want it to.
   *
   * Read live from the same fix the shutter locks, so what is on screen is what
   * gets stamped.
   */
  const place = useCaptureAddress(fix.latitude, fix.longitude);
  const plusCode = place.plusCode ? plusCodeLabel(place.plusCode, place.locality) : null;

  /*
   * The rest of the address, once the street has had its line.
   *
   * `address` is the whole thing — "Onyankle Street, Accra" — and the line above
   * already says "Onyankle Street", so printing both put the street on screen
   * twice inside a box three lines tall. Only what the first line has not
   * already said.
   */
  const rest =
    place.address && place.street && place.address.startsWith(place.street)
      ? place.address.slice(place.street.length).replace(/^[\s,]+/, '')
      : place.address;

  /* Ticks so the clock does not sit at the minute the screen opened. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
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
  /**
   * A stop has been asked for and the file has not arrived yet.
   *
   * Rendered, unlike `stoppingRef`, because the gap is visible: `recordAsync`
   * settles some way after the stop, and until it does the shutter still shows
   * a stop button that now ignores every tap. A control that silently does
   * nothing reads as a broken app — which is how a working save gets reported
   * as a failure.
   */
  const [stopping, setStopping] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const [busy, setBusy] = useState(false);
  /*
   * Whether the camera preview has been set at least once.
   *
   * `recordAsync` resolves "when the camera preview stops", so a recording
   * started before there is a preview ends immediately and writes a zero-byte
   * file. Waiting for `onCameraReady` — documented as "camera preview has been
   * set" — is what prevents that.
   *
   * This was tracked as *which mode* was ready, on the assumption that the
   * event fires again when the `mode` prop changes. The SDK does not document
   * that, and if it does not fire again the flag never reaches `'video'` and
   * recording is blocked for the rest of the session — which is exactly what
   * happened: the shutter did nothing at all.
   *
   * A boolean cannot deadlock. It is the documented meaning of the event, and
   * the other cause of an empty file — a recording stopped before the encoder
   * has written a frame — is handled by the minimum duration instead.
   */
  const [cameraReady, setCameraReady] = useState(false);

  /*
   * Whether this tab is the one on screen.
   *
   * Capture is a tab, and tabs stay mounted when you leave them. The SDK is
   * explicit: "Only one Camera preview can be active at any given time. If you
   * have multiple screens in your app, you should unmount Camera components
   * whenever a screen is unfocused." So the camera is only mounted while this
   * tab is focused, and starts a fresh session every time you return.
   */
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        // The next mount is a new session; its readiness has to be earned again
        // before the shutter will fire, or a photo is asked of a camera that has
        // not started.
        setCameraReady(false);
      };
    }, []),
  );

  /** Bumped to remount the camera after it failed to start. */
  const [session, setSession] = useState(0);
  /** Why the camera would not start, in the platform's words, if it would not. */
  const [mountError, setMountError] = useState<string | null>(null);

  /*
   * When the recording started, and whether it still is.
   *
   * Refs rather than state because both are read from callbacks that outlive
   * the render that created them, and each was wrong in a different way:
   *
   * - `recordAsync` is awaited across the whole recording, so the closure that
   *   resolves it is the one built *before* filming began, when `elapsedS` was
   *   still 0. Every clip was therefore filed as `durationMs: 0`. Wall-clock
   *   time is also simply more accurate than counting one-second ticks, and the
   *   SDK gives us nothing to use instead — `recordAsync` resolves to `uri` and,
   *   on iOS, `codec`. Duration is ours to measure.
   *
   * - The stop handler used to be attached only once `recording` had become
   *   true, so an end-of-recording gesture that beat that re-render had nothing
   *   to stop it and the clip ran on to the full sixty seconds. Stopping now
   *   decides for itself off a ref that is set synchronously, which is what
   *   makes a second tap safe however fast it lands.
   */
  const startedAtRef = useRef(0);
  const recordingRef = useRef(false);
  /**
   * Whether a stop has already been asked for on this recording.
   *
   * `recordingRef` stays true until `recordAsync` settles, which is well after
   * the stop is requested — so without this every other route to a stop is
   * still open in the gap: a second tap, the duration cap, the delayed stop.
   * Asking twice is a native throw on iOS.
   */
  const stoppingRef = useRef(false);
  /** A delayed stop waiting out the minimum duration, so it can be cancelled. */
  const pendingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Fires if a stop never finishes saving. */
  const saveWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when a stuck recording was given up on, so its late failure stays quiet. */
  const abandonedRef = useRef(false);
  /**
   * The guarded stop, reachable from the tab-leave cleanup declared above it.
   *
   * Leaving the tab mid-take must stop through the same single path as a tap or
   * the duration cap. A second, unguarded native stop is exactly what
   * `stoppingRef` exists to prevent: asking a camera that is already stopping to
   * stop again throws on iOS.
   */
  const stopRecordingRef = useRef<() => void>(() => {});

  /*
   * While the tab is on screen the camera holds the media session, so the
   * feed's video players stay idle — see `lib/mediaSession`.
   *
   * **Leaving the tab ends a recording.** The hidden screen's camera view is
   * detached, and the take would die with `CameraUnmountedException`; stopping
   * it on the way out gives the file a chance to finish.
   *
   * Placed after the refs it reads. Declared above them, the compiler could not
   * tell `recordingRef` was a ref, and flagged every later write to it.
   */
  useEffect(() => {
    if (!focused) return;
    setCameraActive(true);
    return () => {
      // Through the one guarded stop, so a stop already in flight is not asked twice.
      if (recordingRef.current) stopRecordingRef.current();
      setCameraActive(false);
    };
  }, [focused]);

  /*
   * What the camera session is asked to be, in its own vocabulary.
   *
   * `Mode` here has four values because the switcher does — audio and live are
   * not camera sessions at all — while `CameraView` knows only stills and
   * video. Derived once so the prop and the readiness check can never disagree
   * about which session is running.
   */
  const cameraMode: 'picture' | 'video' = mode === 'video' ? 'video' : 'picture';

  const setPending = useCaptureStore((s) => s.setPending);

  /*
   * Recording timer, and the client-side duration cap.
   *
   * The reset runs in the cleanup rather than synchronously at the top of the
   * effect. Setting state as an effect *begins* triggers a second render pass
   * before paint — cascading renders, which the React Compiler flags — whereas
   * clearing on the way out happens once the recording has genuinely stopped
   * and produces the same zero.
   */
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      setElapsedS(0);
    };
  }, [recording]);

  const handlePhoto = useCallback(async () => {
    // The docs are explicit that a still requires the camera to be ready.
    if (busy || !cameraReady) return;
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
  }, [busy, cameraReady, fix, confidence, setPending, router]);

  const handleVideoStart = useCallback(async () => {
    // Not while the session is still configuring: a recording started then
    // stops the instant the preview settles, and the file comes back empty.
    if (busy || recordingRef.current || !cameraReady) return;
    hapticRecord();
    recordingRef.current = true;
    stoppingRef.current = false;
    setStopping(false);
    startedAtRef.current = Date.now();
    setRecording(true);
    try {
      const video = await cameraRef.current?.recordAsync({
        maxDuration: MAX_VIDEO_DURATION_S,
        /*
         * H.264, explicitly, and this is the fix for footage the desk could not
         * open at all.
         *
         * Left unset, an iPhone records in whatever its Camera setting says —
         * and "High Efficiency", the default on every recent model, means HEVC
         * in a QuickTime container. **No desktop browser can decode HEVC**, so
         * an editor opening that report got a black frame and "the file could
         * not be opened" about footage the reporter had filmed perfectly well.
         * Relabelling the container on the way through, which the console does,
         * cannot help: the container was never the problem.
         *
         * `avc1` is H.264 — the codec every browser, every player and every
         * broadcast workflow in the country already handles. The file is
         * somewhat larger, which is a real cost on a Ghanaian data bundle and
         * is worth it: an unplayable report is worth nothing to anybody.
         *
         * iOS only, and harmlessly ignored elsewhere. Android's `expo-camera`
         * writes H.264 in MP4 already, which is why this was only ever an
         * iPhone problem.
         */
        ...(Platform.OS === 'ios' ? { codec: 'avc1' as const } : {}),
      });
      if (!video) return;
      setPending({
        uri: video.uri,
        kind: 'video',
        /*
         * What the recorder actually produced, not what was asked for.
         *
         * `recordAsync` resolves with the codec it used on iOS. An older device
         * that ignored the request above would otherwise be filed as though it
         * had honoured it, and the report would reach the desk described as
         * something it is not — which is how this class of bug stays invisible.
         */
        mimeType: videoMimeType(video.uri, (video as { codec?: string }).codec),
        width: null,
        height: null,
        durationMs: Math.max(0, Date.now() - startedAtRef.current),
        fix: lockFix(fix),
        confidence,
      });
      router.push('/capture/review');
    } catch (cause) {
      if (abandonedRef.current) {
        // Already reported by the save watchdog; the late unmount error adds nothing.
        abandonedRef.current = false;
        return;
      }
      /*
       * A recording that failed, said so in words.
       *
       * There was no `catch` here at all. `recordAsync` is awaited across the
       * whole recording, so anything it rejects with — the session interrupted
       * by a call, storage filling up, the encoder refusing — became an
       * unhandled promise rejection: no message, nothing the reporter could
       * read, and on a release build nothing at all. Somebody who had just
       * filmed an incident was left looking at a camera that had plainly done
       * *something* and would not say what.
       *
       * The reason is kept rather than replaced with house wording. This is a
       * native failure we cannot enumerate from here, and "the camera stopped"
       * with the platform's own sentence after it is worth more to somebody in
       * the field — and to whoever they report it to — than a tidy sentence
       * that names nothing.
       */
      hapticWarning();
      toast.error(
        t('capture.recordFailedTitle'),
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : t('capture.recordFailedBody'),
      );
    } finally {
      if (saveWatchRef.current) {
        clearTimeout(saveWatchRef.current);
        saveWatchRef.current = null;
      }
      recordingRef.current = false;
      stoppingRef.current = false;
      setStopping(false);
      setRecording(false);
    }
  }, [busy, cameraReady, fix, confidence, setPending, router, t]);

  /**
   * Stop, exactly once, and never so soon that nothing was written.
   *
   * **Once is the part tap-to-record made load-bearing.** `recordingRef` stays
   * true until `recordAsync` settles, which is some way after the stop is asked
   * for — so between the tap and the file arriving, every other route to a stop
   * is still open: an impatient second tap, the sixty-second cap coming due, the
   * delayed stop below. Under hold-to-record a second release was physically
   * impossible without another press. Under tap-to-record it is one twitchy
   * finger, and `stopRecording` on a camera that has already stopped is a native
   * throw on iOS — which is exactly the "it stopped but something went wrong"
   * this fixed.
   *
   * **And never inside the first second.** A recording that starts and ends in
   * the same second gives the encoder no frames to mux and produces a file of
   * zero bytes rather than an error, so the reporter is told "nothing was
   * recorded" about footage they watched themselves film. Waiting out the
   * remainder costs a moment and makes that impossible.
   */
  const stopRecording = useCallback(() => {
    if (!recordingRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    setStopping(true);

    const elapsedMs = Date.now() - startedAtRef.current;
    const minimumMs = MIN_VIDEO_DURATION_S * 1000;

    /*
     * Guarded, because this is a native call on a session whose state we are
     * inferring. A throw here would replace a recording that very likely
     * succeeded with a crash; `recordAsync` is the thing that knows, and it
     * will resolve with the file or reject with a reason either way.
     */
    const ask = () => {
      try {
        cameraRef.current?.stopRecording();
      } catch {
        /* Already stopped, or the session is gone. `recordAsync` settles. */
      }
      /*
       * If the file has not arrived after this long it is not coming: iOS cut
       * the capture session off, and `recordAsync` will neither resolve nor
       * reject. Give up on it, say so, and start a fresh camera — instead of
       * "Saving…" forever with nothing the reporter can do.
       */
      if (saveWatchRef.current) clearTimeout(saveWatchRef.current);
      saveWatchRef.current = setTimeout(() => {
        saveWatchRef.current = null;
        if (!recordingRef.current) return;
        abandonedRef.current = true;
        recordingRef.current = false;
        stoppingRef.current = false;
        setStopping(false);
        setRecording(false);
        setCameraReady(false);
        hapticWarning();
        toast.error(t('capture.saveStuckTitle'), t('capture.saveStuckBody'));
        setSession((n) => n + 1);
      }, SAVE_TIMEOUT_MS);
    };

    if (elapsedMs >= minimumMs) {
      ask();
      return;
    }
    // Tracked so unmounting cannot leave it to fire against a dead camera.
    pendingStopRef.current = setTimeout(ask, minimumMs - elapsedMs);
  }, [t]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  /*
   * The cap, through the same single stop path as everything else.
   *
   * It used to call `stopRecording` directly, so a reporter tapping stop at the
   * exact moment the sixty seconds came due produced two stops on one
   * recording — the case `stoppingRef` exists for.
   */
  useEffect(() => {
    if (recording && elapsedS >= MAX_VIDEO_DURATION_S) {
      hapticWarning();
      stopRecording();
    }
  }, [recording, elapsedS, stopRecording]);

  const handleVideoStop = useCallback(() => {
    if (!recordingRef.current || stoppingRef.current) return;
    hapticRecord();
    stopRecording();
  }, [stopRecording]);

  /*
   * Nothing left running after this screen goes away.
   *
   * A reporter can leave mid-recording — a back gesture, a call, the app being
   * pushed to the background. The delayed stop above would then fire against a
   * camera that no longer exists.
   */
  useEffect(
    () => () => {
      if (pendingStopRef.current) clearTimeout(pendingStopRef.current);
    },
    [],
  );

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
      {/* Full-screen camera preview — dark whatever it is pointed at. */}
      <StatusBar style="light" />
      {focused ? (
        <CameraView
          key={session}
          ref={cameraRef}
          style={{ flex: 1 }}
          facing={facing}
          enableTorch={torch}
          mode={cameraMode}
          onCameraReady={() => setCameraReady(true)}
          /*
            A camera that fails to start used to fail in silence — a black
            screen indistinguishable from a covered lens. The platform says
            why, and the reporter is owed that sentence and a way to retry.
          */
          onMountError={(event) => setMountError(event.message)}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#000000' }} />
      )}

      {mountError ? (
        <View
          className="items-center justify-center gap-3 bg-black/85"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, padding: 32 }}
        >
          <Ionicons name="camera-outline" size={32} color="#FFFFFF" />
          <Text variant="title-md" onMedia className="text-center">
            {t('capture.cameraFailedTitle')}
          </Text>
          <Text variant="body-sm" onMedia tone="muted" className="text-center">
            {mountError}
          </Text>
          <Button
            label={t('common.retry')}
            className="mt-2"
            onPress={() => {
              setMountError(null);
              setCameraReady(false);
              // A new key is a new session, which is the only retry there is.
              setSession((s) => s + 1);
            }}
          />
        </View>
      ) : null}

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
        {/*
          What this shot will say about where and when it was taken.

          A child of the bottom stack rather than positioned against the screen
          on its own. Placed independently it was measured from the bottom edge
          while the mode switch was measured from the same edge, and the two
          landed on top of each other — the readout sat across Photo / Video /
          Audio / Live. Stacked, the gap between them is arithmetic nobody has
          to keep in their head.

          Hidden while recording: during a take the frame belongs to what is
          being filmed.
        */}
        {!recording ? (
          <View className="w-full flex-row px-4">
            <View style={{ maxWidth: '82%' }}>
              <Glass context="media" elevation="mid" className="gap-0.5 rounded-md px-3 py-2">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="location" size={11} color="rgba(255,255,255,0.85)" />
                  <Text
                    variant="caption"
                    onMedia
                    numberOfLines={1}
                    className="flex-1 font-sans-semibold"
                  >
                    {place.street ?? place.locality ?? plusCode ?? t('capture.findingPlace')}
                  </Text>
                </View>
                {rest ? (
                  <Text variant="caption" tone="muted" onMedia numberOfLines={1}>
                    {rest}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted" onMedia numberOfLines={1}>
                  {now.toLocaleDateString('en-GH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {'  ·  '}
                  {now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Glass>
            </View>
          </View>
        ) : null}

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

        {/*
          Tap to start, tap to stop.

          It was hold-to-record, which is wrong for what this app is for. A
          reporter filming an incident needs both hands, or needs to hold the
          phone steady at arm's length, or is filming something they should not
          be seen filming — and hold-to-record means a thumb pinned to the glass
          for the whole shot, where any slip ends the recording early. It also
          caps a clip at how long someone can comfortably hold still, on a
          control whose whole purpose is a sixty-second maximum.

          Hold is gone rather than kept alongside. Both gestures on one control
          means a press has to decide whether it was a tap or a hold, and that
          ambiguity is exactly what produced the two recording bugs documented
          above — an end that beat a re-render, and a hold the long-press timer
          never registered.
        */}
        {mode !== 'audio' ? (
          <Pressable
            onPress={
              mode === 'photo' ? handlePhoto : recording ? handleVideoStop : handleVideoStart
            }
            haptic={false}
            disabled={busy || stopping}
            accessibilityLabel={
              mode === 'photo'
                ? t('capture.photo')
                : recording
                  ? t('capture.stopRecording')
                  : t('capture.tapToRecord')
            }
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

        {mode === 'video' ? (
          <Text variant="caption" onMedia tone="muted">
            {stopping
              ? t('capture.savingRecording')
              : recording
                ? t('capture.stopRecording')
                : t('capture.tapToRecord')}
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
