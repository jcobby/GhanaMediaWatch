import { useState } from 'react';
import { View } from 'react-native';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { fileSize } from '@/services/media';

/**
 * The captured media, shown back to the reporter before they send it.
 *
 * **Video needs a player, not an image.** This preview was a single
 * `expo-image` for every capture, and `expo-image` cannot decode an MP4 — it
 * fails silently, with no error and no broken-image state, so a video report
 * showed an empty grey box under the words "This is exactly how your report
 * appears to other people". A reporter could not check their own footage before
 * committing to it, and had no way to tell a blank preview from a failed
 * recording.
 *
 * The player is muted and looping: this is a thumbnail that happens to move,
 * shown while somebody is typing a description, and sound would be a surprise.
 * Autoplay is what makes a frame appear at all — a paused player on a local
 * file renders black until it is touched.
 *
 * **An empty capture says so here.** A recording that wrote no bytes and a
 * player that has not drawn its first frame look identical — a grey rectangle —
 * and the difference matters: one is worth waiting for and the other has to be
 * filmed again. The app knew already, but only checked at submit, so somebody
 * could write a description and choose a destination for footage that did not
 * exist. Checking the file is cheap and synchronous, and turns "this is exactly
 * how your report appears to other people" from a lie into a warning.
 */
export function CapturePreview({ uri, kind }: { uri: string; kind: 'photo' | 'video' | 'audio' }) {
  const c = useColors();
  /*
   * Whether the thing that was supposed to draw the frame gave up.
   *
   * Without this a failed decode is a grey rectangle — the same rectangle as a
   * player still warming up, an empty file, and a wrong path. Four different
   * problems with one appearance, and the screen underneath saying "this is
   * exactly how your report appears to other people". Naming the failure is the
   * difference between "wait a moment" and "film it again".
   */
  const [failed, setFailed] = useState(false);

  /*
   * Called unconditionally, with a null source when there is nothing to play.
   *
   * `useVideoPlayer` is a hook and cannot sit behind an `if`. `null` is an
   * accepted source, so a photo or a voice note costs nothing here.
   */
  /*
   * Whether there is anything in the file at all.
   *
   * Read during render, which is safe because it is synchronous and touches a
   * local file the app just wrote. An empty one is the known failure mode of a
   * recording that stopped too early or started before the camera was ready.
   */
  const bytes = fileSize(uri);

  const player = useVideoPlayer(kind === 'video' && bytes > 0 ? uri : null, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  /*
   * Whether the player gave up on the file.
   *
   * `VideoView` has no `onError` — the documented way to hear about a failed
   * load or a failed decode is the player's own `statusChange` event, whose
   * payload carries `status` and, on failure, `error.message`. Without this the
   * video branch could never reach the failure state below: `failed` was only
   * ever set by the photo's `onError`, so unreadable footage rendered as a
   * black rectangle, which is indistinguishable from a player still loading.
   * That black rectangle is the thing that was reported.
   */
  const playback = useEvent(player, 'statusChange', { status: player.status });
  const playbackError = kind === 'video' && playback?.status === 'error';

  if (bytes === 0 || failed || playbackError) {
    return (
      <View className="absolute inset-0 items-center justify-center gap-2 bg-canvas-raise px-6">
        <Ionicons name="alert-circle" size={28} color={c.danger} />
        <Text variant="body-sm" tone="muted" className="text-center">
          {bytes === 0
            ? kind === 'video'
              ? 'This recording is empty — nothing was captured. Film it again.'
              : 'This file is empty — nothing was captured. Try again.'
            : `This ${kind === 'video' ? 'recording' : 'photo'} could not be opened. Capture it again.`}
        </Text>
        {/* The size is the one fact that separates "empty" from "unreadable",
            and it is what anybody debugging this would ask for first. The
            player's own message is added when there is one: "unsupported
            format" tells a reporter something a byte count cannot. */}
        <Text variant="caption" tone="faint" className="text-center">
          {bytes === 0 ? 'The file is 0 bytes.' : `The file is ${Math.round(bytes / 1024)} KB.`}
          {playbackError && playback?.error?.message ? ` ${playback.error.message}` : ''}
        </Text>
      </View>
    );
  }

  if (kind === 'audio') {
    /*
     * A voice recording has no frame. Rather than an empty box that reads as a
     * failed load, the preview says what it is.
     */
    return (
      <View className="absolute inset-0 items-center justify-center gap-2 bg-canvas-raise">
        <Ionicons name="mic" size={28} color={c.accent} />
        <Text variant="body-sm" tone="muted">
          Voice report
        </Text>
      </View>
    );
  }

  if (kind === 'video') {
    return (
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        /*
         * `contain`, not `cover`.
         *
         * Phone video is portrait and cropping it to fill a box hides the top
         * and bottom of the reporter's own footage — the part they are here to
         * check before committing to it permanently. Nothing is cropped now.
         */
        contentFit="contain"
        /*
         * Real controls, so the whole clip can be watched.
         *
         * It loops silently on its own, which is enough to confirm something
         * was captured but not enough to review sixty seconds of it. Somebody
         * deciding whether to send footage needs to be able to scrub through
         * it, and there was no way to.
         */
        nativeControls
        onFirstFrameRender={() => setFailed(false)}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      // Nothing cropped: the whole photo is what is being reviewed.
      contentFit="contain"
      transition={180}
      onError={() => setFailed(true)}
    />
  );
}
