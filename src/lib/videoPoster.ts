import { createVideoPlayer, type VideoPlayer, type VideoThumbnail } from 'expo-video';
import { Image, type ImageRef } from 'expo-image';
import { isCameraActive, subscribeToCameraActive } from './mediaSession';

/**
 * Still frames for a service that generates none.
 *
 * **Why the feed shows a water drop.** `media.posterUrl` is null for every video
 * the platform holds, so `Thumbnail` falls back to the bundled category artwork
 * and a flood report shows a drawing of a raindrop instead of the thing somebody
 * filmed. Twenty rows of that is a feed that looks like clip-art.
 *
 * The phone can take the frame itself: open a player, seek, and ask for it.
 * Three things make that affordable rather than reckless, and each is a rule in
 * the test file.
 *
 * 1. **It happens once per report, ever.** The frame goes into `expo-image`'s
 *    own disk cache under a key derived from the incident id, so the second
 *    launch reads a file instead of re-opening a player. This matters more here
 *    than it would elsewhere: taking a frame means pulling the head of the video
 *    down a mobile connection, and the people using this app are paying for
 *    those megabytes by the bundle.
 *
 * 2. **One at a time.** A feed renders twenty rows at once. Twenty players
 *    seeking twenty remote files in parallel would saturate the connection and
 *    leave the list stuttering, so work goes through a queue that runs a single
 *    job and holds the rest.
 *
 * 3. **Every player is released.** `createVideoPlayer` puts the lifetime in our
 *    hands — the SDK is explicit that failing to release leaks — so release is
 *    in a `finally`, including on the paths where loading failed.
 *
 * **This is a stopgap and should be deleted.** The right place to cut a poster
 * is once at ingest, where it costs the server one ffmpeg call and every client
 * — this app, the editorial desk, anything built later — gets it for nothing.
 * Item 5 in BACKEND-REQUESTS asks for it. Until then the alternative on screen
 * is clip-art, so the phone does the work.
 */

/**
 * A second in, not frame zero.
 *
 * Phone recordings routinely open on a blur, a lens still adjusting, or the
 * ground, because the operator is raising the phone as it starts recording. A
 * second later there is usually a picture of the thing they were filming.
 */
const FRAME_AT_SECONDS = 1;

/**
 * Wide enough for a full-bleed lead, small enough to be worth storing.
 *
 * The lead is the whole screen width and the rows are 112px, so this is sized
 * for the larger of the two and downscaled for the other.
 */
const FRAME_MAX_WIDTH = 720;

/**
 * How long to wait for a clip to become playable before giving up.
 *
 * Long enough for a slow Ghanaian mobile connection to buffer the head of a
 * file, short enough that a dead URL does not hold the queue closed behind it.
 */
const READY_TIMEOUT_MS = 8000;

/** One job at a time. See rule 2 above. */
const MAX_ACTIVE = 1;

const cacheKeyFor = (incidentId: string) => `dawuro.poster.${incidentId}`;

/**
 * A frame, as something an image view can draw.
 *
 * Two shapes, and the difference is only how long it lives. A path is a frame
 * on disk, which survives this component, this screen and this launch. A
 * `VideoThumbnail` is the live native image we just cut — `expo-image` takes one
 * as a source directly — and it is what we fall back to on the rare device where
 * storing it did not work, so a frame is still shown rather than thrown away.
 */
export type Poster = string | VideoThumbnail;

/**
 * What is known about each report's frame.
 *
 * A `Poster` is a frame we have. `null` is a miss we have already paid for and
 * will not pay for again this launch. Absent means untried.
 */
const known = new Map<string, Poster | null>();

/** Reports already queued or running, so a re-render does not queue them twice. */
const claimed = new Set<string>();

const queue: { id: string; url: string }[] = [];
let active = 0;

const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

/** Subscribe to frames landing. Paired with `peek` for `useSyncExternalStore`. */
export function subscribeToPosters(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The frame for a report, if one is already in hand.
 *
 * Synchronous and allocation-free, because it is a `useSyncExternalStore`
 * snapshot: returning a fresh object here would re-render on every check.
 */
export function peekPoster(incidentId: string): Poster | null {
  return known.get(incidentId) ?? null;
}

/**
 * Ask for a report's frame. Returns immediately; the frame arrives later.
 *
 * Safe to call on every render — a report already known, queued or running is
 * dropped here rather than queued again.
 */
export function requestPoster(incidentId: string, url: string): void {
  if (known.has(incidentId) || claimed.has(incidentId)) return;
  claimed.add(incidentId);

  void (async () => {
    /*
     * The disk first, before anything opens a player.
     *
     * This is the whole reason the second launch is free: a frame taken last
     * week is still on disk under the same key, and the signed URL it came from
     * having long since expired does not matter, because we are not going back
     * to the network for it.
     */
    try {
      const stored = await Image.getCachePathAsync(cacheKeyFor(incidentId));
      if (stored) {
        known.set(incidentId, asUri(stored));
        claimed.delete(incidentId);
        announce();
        return;
      }
    } catch {
      // An unreadable cache is not a reason to skip the frame; fall through and
      // take it again.
    }

    queue.push({ id: incidentId, url });
    pump();
  })();
}

/**
 * Keep a frame from the reporter's own copy, before that copy is deleted.
 *
 * Called once an upload completes and the report finally has a server id. The
 * recording is still on the phone at that moment and is about to be reclaimed,
 * so this is the only point where the two facts exist together — and cutting
 * the frame here costs nothing at all: no signed URL, no range requests, no
 * waiting for a remote file to buffer.
 *
 * `atMs` is the moment the reporter chose on the review screen. Without one
 * this does nothing and the ordinary path takes its frame a second in.
 *
 * Failure is silent on purpose. This runs at the end of a successful upload,
 * and a thumbnail that could not be cut is not a reason to tell somebody their
 * report did not send.
 */
export async function adoptLocalPoster(
  incidentId: string,
  localUri: string,
  atMs: number | null,
): Promise<void> {
  if (atMs === null) return;
  /*
   * Skipped while the camera is up. This runs when an upload finishes, which
   * happens in the background — often while the reporter is already filming the
   * next thing — and opening a player then would cut their camera off mid-take.
   * The report falls back to the ordinary frame a second in.
   */
  if (isCameraActive()) return;

  const player = createVideoPlayer(localUri);
  player.audioMixingMode = 'mixWithOthers';
  player.muted = true;
  try {
    await playable(player);
    const [frame] = await player.generateThumbnailsAsync([atMs / 1000], {
      maxWidth: FRAME_MAX_WIDTH,
    });
    if (!frame) return;

    const stored = await store(incidentId, frame);
    known.set(incidentId, stored ?? frame);
    announce();
  } catch {
    // The clip is gone, unreadable, or shorter than the offset. The report is
    // filed either way, which is the thing that mattered.
  } finally {
    player.release();
  }
}

/*
 * Held while the camera is up, resumed when it is not.
 *
 * Every job opens a video player, and a player appearing or disappearing while
 * the camera records resets the audio session and cuts the camera off. Frames
 * can wait a few seconds; somebody's footage cannot.
 */
subscribeToCameraActive(() => {
  if (!isCameraActive()) pump();
});

function pump(): void {
  // Not while the camera owns the media session. Resumed by the subscription above.
  while (!isCameraActive() && active < MAX_ACTIVE && queue.length > 0) {
    const job = queue.shift();
    if (!job) return;

    active += 1;
    void (async () => {
      try {
        known.set(job.id, await capture(job.id, job.url));
      } catch {
        /*
         * A codec the device cannot decode — QuickTime and HEVC both turn up in
         * this library — a signature that expired between the feed loading and
         * this running, or a clip shorter than the offset. Recorded as a miss so
         * a feed scrolled twice does not seek the same unreadable file again.
         *
         * Deliberately *not* written to disk. A miss caused by an expired URL
         * should be retried on the next launch with a fresh one; a miss stored
         * permanently would make one bad minute last forever.
         */
        known.set(job.id, null);
      } finally {
        claimed.delete(job.id);
        active -= 1;
        announce();
        pump();
      }
    })();
  }
}

async function capture(incidentId: string, url: string): Promise<Poster | null> {
  // The same cache the slides play from, so the bytes read to cut this frame
  // are not downloaded a second time when the clip plays.
  const player = createVideoPlayer({ uri: url, useCaching: true });
  // Only ever cutting a still frame: it must never claim the phone's audio, or
  // the camera on the capture tab loses its session while this runs.
  player.audioMixingMode = 'mixWithOthers';
  player.muted = true;
  try {
    /*
     * Wait for the clip to be playable before asking for a frame.
     *
     * `createVideoPlayer` returns before the source is loaded, and a player that
     * has not buffered anything has no frame to give — asking immediately was
     * the first version of this and it returned nothing every time, which looked
     * exactly like the bug it was meant to fix.
     */
    await playable(player);

    const [frame] = await player.generateThumbnailsAsync([FRAME_AT_SECONDS], {
      maxWidth: FRAME_MAX_WIDTH,
    });
    if (!frame) return null;

    return (await store(incidentId, frame)) ?? frame;
  } finally {
    // `createVideoPlayer` hands us the lifetime, and the SDK is explicit that
    // not releasing leaks. In `finally`, so a failed load releases too.
    player.release();
  }
}

/**
 * Keep a frame for next launch. Returns its path, or null if it could not be.
 *
 * Kept in `expo-image`'s own cache rather than as a file we manage: it is a
 * native image reference rather than bytes we hold, `expo-image` is already the
 * thing that will draw it, and its cache has an eviction policy written by
 * people who thought about storage pressure, which a folder of ours would not.
 *
 * **The cast.** `writeToCacheAsync` is typed for `ImageRef`, and a
 * `VideoThumbnail` is a different class — but both are declared `SharedRef
 * <'image'>`, which is to say both are a handle to the same native object, a
 * `Drawable` on Android and a `UIImage` on iOS. The two classes differ only in
 * the convenience getters TypeScript compares them by: `ImageRef` publishes
 * `scale` and `mediaType`, the thumbnail publishes `requestedTime`. Neither is
 * anything the cache reads.
 *
 * Even so it crosses a boundary the SDK does not document, so failure here is
 * not allowed to cost the reader a picture: the caller falls back to the live
 * frame, which `<Image source>` accepts as a `SharedRef` by its published type.
 * The cost of being wrong is a frame re-cut on the next launch, not a blank.
 */
async function store(incidentId: string, frame: VideoThumbnail): Promise<string | null> {
  try {
    await Image.writeToCacheAsync(frame as unknown as ImageRef, cacheKeyFor(incidentId));
    const stored = await Image.getCachePathAsync(cacheKeyFor(incidentId));
    return stored ? asUri(stored) : null;
  } catch {
    return null;
  }
}

/** Resolves once the player can produce frames; rejects on error or timeout. */
function playable(player: VideoPlayer): Promise<void> {
  if (player.status === 'readyToPlay') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove();
      reject(new Error('poster: timed out waiting for the clip to load'));
    }, READY_TIMEOUT_MS);

    const settle = (outcome: () => void) => {
      clearTimeout(timer);
      subscription.remove();
      outcome();
    };

    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') settle(resolve);
      else if (status === 'error') {
        settle(() => reject(error ?? new Error('poster: the clip failed to load')));
      }
    });
  });
}

/**
 * A cache path as something an image view will accept.
 *
 * Android returns a bare filesystem path here and iOS returns one already
 * carrying a scheme, so this normalises rather than assuming either.
 */
function asUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`;
}

/** Test seam: forget everything learned this launch. Not used by the app. */
export function resetPosterCacheForTests(): void {
  known.clear();
  claimed.clear();
  queue.length = 0;
  active = 0;
}
