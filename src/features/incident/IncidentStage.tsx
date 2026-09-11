import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Text } from '@/components/ui';
import { MIN_PLAUSIBLE_MEDIA_BYTES } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import type { Incident } from '@/types/api';

/**
 * The footage on a report screen, actually playing.
 *
 * **This was one `expo-image` for every report.** `expo-image` cannot decode an
 * MP4 — it fails without an error and without a broken-image state — so opening
 * a video gave a black rectangle with a play button drawn over it that was
 * `pointerEvents="none"`: decoration, wired to nothing. There was no way to
 * play, pause or scrub the one thing the reader had opened the page for.
 *
 * **It then could not stream, either.** `GET /v1/media/{id}` did not support
 * HTTP byte ranges — `Range: bytes=0-99` answered 200 with the whole body and
 * no `Content-Range` — and iOS `AVPlayer` requires ranges to open a remote
 * asset at all. The workaround was to fetch the entire file to disk before
 * playing a frame of it: correct, and several megabytes and a spinner before
 * anything moved.
 *
 * **Ranges have landed.** The service now answers `Accept-Ranges: bytes` and a
 * 206 with `Content-Range`, so the player is given the URL and opens it: the
 * clip starts on its first frames instead of its last byte, and the scrubber
 * seeks without downloading what it skips. `services/remoteMedia` and the
 * download it performed are deleted.
 *
 * The signed URL expires an hour after it is issued. That is far longer than
 * the gap between reading a record and opening it, and a URL that has gone
 * stale surfaces as the same `statusChange` error every other failure does.
 *
 * `nativeControls` rather than a hand-built bar: the platform's own transport is
 * what people already know, and it is reachable to a screen reader. Everything
 * overlaying the stage has to stay out of its way, or the controls exist and
 * cannot be pressed.
 */
export function IncidentStage({
  incident,
  onFailed,
  failed,
}: {
  /*
   * Only what is actually drawn.
   *
   * Declared as a whole `Incident`, this refused an `AuthoredIncident` — the
   * reporter's own record, whose `publishedAt` is null until an editor runs it
   * — even though the three fields this component reads are identical on both.
   * Naming them keeps the stage usable from the public detail screen and the
   * reporter's own sheet without either shape bending to the other.
   */
  incident: Pick<Incident, 'id' | 'media' | 'description'>;
  /** Told to the screen so the caption and actions can react. */
  onFailed: (failed: boolean) => void;
  failed: boolean;
}) {
  const c = useColors();
  const isVideo = incident.media.kind === 'video';

  /*
   * Too small to be footage, decided before anything tries to open it.
   *
   * The service stores integration probes alongside real reports — 2 048 or
   * 8 192 bytes of filler with no container header — and a player given one
   * shows 0:00 on black forever. A reader cannot tell that from a slow
   * connection, so it is named instead.
   */
  const bytes = incident.media.byteSize;
  const notMedia = typeof bytes === 'number' && bytes < MIN_PLAUSIBLE_MEDIA_BYTES;
  const playable = isVideo && !notMedia;

  /*
   * The URL the player is given, or null.
   *
   * Streamed straight from the service now that it answers byte ranges. The
   * whole file used to be downloaded to disk first — a few megabytes and a
   * spinner before the first frame — because `AVPlayer` will not open a remote
   * asset that cannot be ranged.
   *
   * Null for a photo and for anything too small to be footage, so the player is
   * never handed something it will sit on at 0:00.
   */
  const source = playable && incident.media.url ? incident.media.url : null;

  /*
   * Called unconditionally, with a null source for a photo.
   *
   * `useVideoPlayer` is a hook and cannot sit behind an `if`; null is an
   * accepted source, so a report with nothing to play costs nothing.
   */
  const player = useVideoPlayer(source, (instance) => {
    instance.muted = true;
    instance.play();
  });

  /*
   * `VideoView` has no `onError`. The documented way to hear about a failed
   * load or decode is the player's own `statusChange`, and without it a video
   * that cannot be opened sits on a black frame with no explanation — the
   * failure this component exists to end.
   */
  const status = useEvent(player, 'statusChange', { status: player.status });
  const playbackFailed = Boolean(source) && status?.status === 'error';

  useEffect(() => {
    if (playbackFailed) onFailed(true);
  }, [playbackFailed, onFailed]);

  if (notMedia || failed || playbackFailed) {
    return (
      <View className="absolute inset-0 items-center justify-center gap-3 bg-canvas-raise px-10">
        <Ionicons name="alert-circle-outline" size={32} color={c.textFaint} />
        {/*
          Three failures, told apart. They shared one sentence — "this photo is
          no longer on the server" — which was wrong about two of them, and
          wrong about the word "photo" on every video.

          The fourth was "could not be downloaded", which went with the download
          itself: nothing is fetched ahead of playback any more, so a network
          problem now surfaces as the player failing to open the stream and is
          covered by the last sentence.
        */}
        <Text variant="body-sm" tone="muted" className="text-center">
          {bytes === 0
            ? 'Nothing was uploaded for this report.'
            : notMedia
              ? `This is not playable ${isVideo ? 'footage' : 'media'} — the stored file is only ${Math.round((bytes ?? 0) / 1024)} KB.`
              : `This ${isVideo ? 'video' : 'photo'} could not be opened. The rest of the report is intact.`}
        </Text>
      </View>
    );
  }

  if (isVideo) {
    /*
     * Buffering, said out loud.
     *
     * A player renders black until it has enough to show, which is the blank
     * rectangle this component exists to end arriving by a third route. It is
     * a much shorter wait than it was — the stream starts on the first frames
     * rather than the last byte — but on a Ghanaian mobile connection it is
     * still long enough that silence reads as broken.
     */
    if (status?.status === 'loading' || status?.status === 'idle') {
      return (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-black px-10">
          <ActivityIndicator color={c.textOnDark} />
          <Text variant="caption" onMedia tone="muted" className="text-center">
            Loading the footage
          </Text>
        </View>
      );
    }

    return (
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        // `contain`, so a portrait clip is not cropped to a landscape stage.
        // This is evidence; the parts cut off may be the parts that matter.
        contentFit="contain"
        /*
          Fullscreen comes with the native controls; there is no
          `allowsFullscreen` prop in SDK 57 — it is `fullscreenOptions`, and the
          default is what we want. Picture-in-picture is deliberately not
          enabled: it needs config-plugin setup per platform, and a report
          continuing to play in a floating window after the reader has left the
          screen is not obviously what anyone wants from evidence.
        */
        nativeControls
      />
    );
  }

  return (
    <Image
      source={{ uri: incident.media.url }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      contentFit="cover"
      transition={220}
      accessibilityLabel={incident.description}
      onError={() => onFailed(true)}
    />
  );
}
