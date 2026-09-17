import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { Thumbnail } from '@/components/Thumbnail';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import { useCameraActive } from '@/lib/mediaSession';
import type { Incident } from '@/types/api';
import { LEAD_IMAGE_RATIO } from './leadLayout';

/**
 * The lead story, given the room a lead deserves.
 *
 * The feed was forty identical rows. Every report had the same 112×86 thumbnail
 * and the same three lines, so the most important thing on the desk looked
 * exactly like the fortieth — and a reader opening the app had nothing to land
 * on. Every newspaper and every news app solves this the same way, because it
 * works: one story gets the width of the page, and the rest queue beneath it.
 *
 * **Why the first item, and not a score.** The server orders the feed, and for
 * a desk that means the top of it is the lead — the same judgement an editor
 * already made when they published it to a section. Picking a different one
 * here would be this client second-guessing the newsroom with a number the
 * phone computed on its own.
 *
 * It is *not* shown over a search. A result list has a first row, not a lead,
 * and putting "Top story" over whatever happened to match is the interface
 * asserting an editorial judgement nobody made.
 */
/**
 * Exact offsets and sizes go through `style`, never a utility class.
 *
 * `bottom-4` appeared nowhere else in this app, and NativeWind compiles
 * `global.css` when Metro boots — so a class it has never seen is not in the
 * compiled sheet and the rule is dropped in silence. A React Native view with
 * `position: absolute` and no `bottom` falls back to its static position, which
 * put the play badge at the *top* of the lead, sitting on the eyebrow.
 *
 * No error, no warning, and it survives a reload. The same trap the feed row
 * hit when `w-[112px]` collapsed its thumbnail to nothing, and the reason the
 * 16:9 height below is arithmetic rather than `aspect-[16/9]`.
 */
const OVERLAY_BOTTOM_LEFT = { position: 'absolute', bottom: 16, left: 16 } as const;
const OVERLAY_CENTRE = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/**
 * Run a call on a native player that may already have been released.
 *
 * Returns undefined when the player is gone. See the playback effect.
 */
function safely<T>(call: () => T): T | undefined {
  try {
    return call();
  } catch {
    return undefined;
  }
}

export const FeedLead = memo(function FeedLead({
  incident,
  onOpen,
  playing = false,
  preload = false,
  onPlaybackStarted,
}: {
  incident: Incident;
  onOpen: (incident: Incident) => void;
  /**
   * Whether this is the slide on screen, and its footage should be moving.
   *
   * Only ever one at a time: five clips playing at once would cost a reader
   * several megabytes for four stories they never saw.
   */
  playing?: boolean;
  /**
   * Whether this is the slide coming next, and its clip should start buffering.
   *
   * **Why a slide showed its thumbnail and never moved.** A clip used to begin
   * loading only once its slide was already on screen, so every video started
   * from nothing — over mobile data that is seconds before the first frame, and
   * the rotation had often moved on by then. Loading the next one while the
   * current one plays means it is ready the moment it arrives. One ahead, never
   * more, matching `FEED_PRELOAD_AHEAD`: the head of one clip is a small cost,
   * the whole rotation is not.
   */
  preload?: boolean;
  /**
   * Called when the footage is actually moving on screen.
   *
   * The rotation times a video slide from here rather than from when the slide
   * appeared, so a slow clip gets its full preview instead of being swapped away
   * while it buffers.
   */
  onPlaybackStarted?: () => void;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();

  const isVideo = incident.media.kind === 'video';
  const isAudio = incident.media.kind === 'audio';

  /*
   * 16:9, measured rather than an aspect class. See `OVERLAY_BOTTOM_LEFT`.
   */
  const imageHeight = Math.round(width * LEAD_IMAGE_RATIO);

  /*
   * The footage itself, while this slide is the one being shown.
   *
   * Muted, always. Sound starting on its own in a feed is hostile — a reader
   * scrolling in a lorry, a clinic or a meeting has not asked for it, and on a
   * report about a confrontation it is worse than hostile.
   *
   * A hook, so it is called unconditionally; a null source is the documented
   * way to have it do nothing on the four slides that are not on screen.
   */
  /*
   * No footage while the camera is up. A player changing state resets the
   * phone's audio session, which cuts a recording camera off — see
   * `lib/mediaSession`. The feed is off screen then anyway.
   */
  const cameraActive = useCameraActive();
  const source =
    !cameraActive && (playing || preload) && isVideo && incident.media.url
      ? incident.media.url
      : null;
  /*
   * Cached on disk, so a slide plays from the phone rather than the network.
   *
   * The rotation comes round to the same five clips again and again, and the
   * reader reopens the app to the same top stories. Without the cache every
   * pass downloaded the clip from the start, which is the wait before the first
   * frame. The player rebuilds only when the source's contents change, so the
   * object here is not a new player on every render.
   */
  const player = useVideoPlayer(source ? { uri: source, useCaching: true } : null, (instance) => {
    instance.muted = true;
    /*
     * Muted autoplay must never claim the phone's audio. Left at the default,
     * a silent clip at the top of the feed could take the device's media
     * session away from whatever else was using it — somebody's music, and the
     * camera on the next tab, which came back black with no error.
     */
    instance.audioMixingMode = 'mixWithOthers';
    /*
     * No loop. The rotation moves on when the preview is done, and a clip
     * starting again underneath a slide that is about to leave is motion for
     * its own sake.
     */
    instance.loop = false;
  });

  /*
   * Playback is driven here, not from the setup callback above.
   *
   * **The setup runs once, when the player is created.** All five slides mount
   * together with `playing` false, so every player is built against a null
   * source and its setup fires then — and when a slide later becomes the one on
   * screen, the source is replaced but the setup is never called again. Putting
   * `play()` in there meant only the very first slide ever moved, and even that
   * one raced the file loading. Nothing errored; the rotation simply showed
   * five still frames.
   *
   * Restarting from zero matters as much as playing. A reader who comes back
   * round to a story should see the opening of the clip, not the last second of
   * it frozen where the previous turn stopped.
   */
  /*
   * The latest callback, read from a ref.
   *
   * The rotation builds this callback fresh on every render. Depending on it in
   * the playback effect would restart the clip from zero each time the carousel
   * re-rendered — which it does on every scroll event.
   */
  const startedRef = useRef(onPlaybackStarted);
  useEffect(() => {
    startedRef.current = onPlaybackStarted;
  });

  /*
   * Whether the clip on screen is still waiting for its first frames.
   *
   * The play badge alone looked identical whether the clip was about to move or
   * stuck on a slow connection, so a reader had no way to tell "loading" from
   * "this is a photo". A spinner over the still says it is coming.
   */
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!source) {
      setWaiting(false);
      return;
    }

    // Buffering ahead of its turn: loaded, held at the start, not moving.
    if (!playing) {
      setWaiting(false);
      safely(() => player.pause());
      return;
    }

    setWaiting(true);
    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        setWaiting(false);
        startedRef.current?.();
      }
    });
    const statusSub = player.addListener('statusChange', ({ status }) => {
      // `loading` is the stall mid-clip too, not only the start.
      if (status === 'loading') setWaiting(true);
      else if (status === 'readyToPlay' && player.playing) setWaiting(false);
      // A clip that will not play falls back to the still; no endless spinner.
      else if (status === 'error') setWaiting(false);
    });
    safely(() => {
      player.currentTime = 0;
      player.play();
    });
    // A clip preloaded to readiness can already be moving by the time the
    // listener is attached, and would otherwise never announce it.
    if (safely(() => player.playing)) {
      setWaiting(false);
      startedRef.current?.();
    }

    return () => {
      playingSub.remove();
      statusSub.remove();
      /*
       * **The crash on switching desks.** Changing section remounts the top
       * stories, and `useVideoPlayer` releases its native player as the slide
       * unmounts — sometimes before this cleanup runs. Calling `pause()` on a
       * released player throws "Unable to find the native shared object" and
       * takes the whole feed down with a render error. A player that no longer
       * exists is already not playing, so there is nothing to recover.
       */
      safely(() => player.pause());
    };
  }, [source, player, playing]);

  /*
   * The service's 1280px copy — a full-width slide needs more than a row's
   * thumb and far less than the original photo. Older reports have no copies
   * and fall back to the poster.
   */
  const still = incident.media.viewUrl || incident.media.posterUrl;

  const poster = useVideoPoster({
    id: incident.id,
    kind: incident.media.kind,
    url: incident.media.url,
    posterUrl: still,
  });

  return (
    <Pressable
      onPress={() => onOpen(incident)}
      accessibilityLabel={incident.description}
      haptic={false}
      className="bg-canvas"
    >
      <View style={{ width, height: imageHeight }} className="relative">
        <Thumbnail
          uri={still}
          cacheKey={incident.id}
          /*
            A frame the phone cut from the clip, because the service sends none.
            Without it a flood report leads with a drawing of a raindrop instead
            of the thing somebody filmed. See `lib/videoPoster`.
          */
          poster={poster}
          category={incident.category}
          style={{ width, height: imageHeight }}
          glyphSize={44}
        />

        {/*
          The clip, over the still.

          The poster stays underneath rather than being replaced, so the slide
          has something to show for the moment before the first frame arrives —
          and something to fall back to if the file will not play at all.
        */}
        {source ? (
          <VideoView
            player={player}
            style={{ position: 'absolute', width, height: imageHeight }}
            contentFit="cover"
            nativeControls={false}
            // The whole slide is one tap target that opens the report. Controls
            // here would put a scrubber between the reader and that.
            pointerEvents="none"
          />
        ) : null}

        {/* Footage announces itself. A still and a clip are different things to
            open, and the reader decides before tapping rather than after. */}
        {source && waiting ? (
          <View style={OVERLAY_CENTRE} pointerEvents="none">
            <View
              className="flex-row items-center gap-2 rounded-pill bg-black/60"
              style={{ paddingHorizontal: 14, paddingVertical: 8 }}
              accessibilityLabel="Loading video"
            >
              <ActivityIndicator size="small" color={c.textOnDark} />
              <Text variant="caption" style={{ color: c.textOnDark }}>
                Loading video
              </Text>
            </View>
          </View>
        ) : null}

        {(isVideo || isAudio) && !(source && waiting) ? (
          <View
            style={OVERLAY_BOTTOM_LEFT}
            className="h-11 w-11 items-center justify-center rounded-pill bg-black/55"
          >
            <Ionicons
              name={isAudio ? 'mic' : 'play'}
              size={20}
              color={c.textOnDark}
              style={isVideo ? { marginLeft: 2 } : undefined}
            />
          </View>
        ) : null}
      </View>

      {/*
        The headline, large, directly under the picture — the lead of a news
        app, where the words are the second thing anybody reads and the only
        thing they decide on. Then one quiet line of when and where.

        No category label and no colour: on the lead the picture already says
        what kind of story it is, and a coloured tag above the headline would
        compete with it.
      */}
      <View className="px-4 pb-4 pt-3">
        <Text
          variant="title-md"
          className="font-sans-semibold"
          style={{ fontSize: 18, lineHeight: 24 }}
          numberOfLines={3}
        >
          {incident.description}
        </Text>

        <View className="mt-2 flex-row items-center gap-2">
          {/*
            Who it is from, first. A lead released by a named organisation is
            credited to it, and a reader weighs that before anything else.
          */}
          {incident.publisher.kind === 'organisation' ? (
            <Text variant="body-sm" tone="secondary" className="font-sans-semibold" numberOfLines={1}>
              {incident.publisher.verified
                ? `${incident.publisher.displayName} ✓`
                : incident.publisher.displayName}
              {'  •'}
            </Text>
          ) : null}
          <Text variant="body-sm" tone="faint">
            {formatRelativeTime(incident.publishedAt)}
          </Text>

          {/*
            Where it happened, when the service resolved a name for it.

            Absent rather than placeheld: a reporter who withheld their location
            did so for a reason, and "Location hidden" on the lead advertises
            that there was something to hide — the same rule the row follows.
          */}
          {incident.location.label ? (
            <Text variant="body-sm" tone="faint" numberOfLines={1} className="flex-1">
              {`•  ${incident.location.label}`}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
