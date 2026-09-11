/**
 * Tunable constants for the capture pipeline and sync engine.
 * Every magic number the product depends on lives here, not inline.
 */

/**
 * Horizontal accuracy (metres) a location fix must reach before the camera is
 * allowed to mount. 20 m is roughly the best a consumer phone GPS achieves
 * outdoors within a few seconds; tightening it further makes the gate feel
 * broken in urban canyons, loosening it makes the coordinate useless for
 * dispatching someone to the scene.
 */
export const GPS_ACCURACY_THRESHOLD_M = 20;

/**
 * How long we let accuracy sit above the threshold before showing the "move to
 * an open area" coaching state and offering the reduced-accuracy escape hatch.
 */
export const GPS_STALL_TIMEOUT_MS = 30_000;

/** Accuracy above this is not offered even via the escape hatch — it is noise. */
export const GPS_ABSOLUTE_MAX_ACCURACY_M = 150;

/** Minimum interval between location updates while acquiring a fix. */
export const GPS_WATCH_INTERVAL_MS = 1_000;

/** Maximum video length, enforced client-side with a visual ring countdown. */
export const MAX_VIDEO_DURATION_S = 60;

/**
 * The shortest recording that produces a usable file.
 *
 * A tap that starts and stops inside the same second gives the encoder no
 * frames to mux and writes a file of zero bytes — with no error, so the app
 * only discovers it later and tells the reporter "nothing was recorded" about
 * footage they watched themselves film. Holding the stop to one whole second
 * costs a moment and removes the failure.
 */
export const MIN_VIDEO_DURATION_S = 1;

/** Decimal places used whenever coordinates are shown to a human. ~0.11 m. */
export const COORDINATE_PRECISION = 6;

/**
 * Resumable upload chunk size. 5 MiB balances request overhead against the cost
 * of re-sending a chunk when a mobile connection drops mid-flight.
 */
export const UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Exponential backoff schedule for failed uploads, in milliseconds.
 * Index = attemptCount. Past the end of the array the last value repeats, so
 * the queue keeps trying hourly rather than giving up on a report.
 */
export const UPLOAD_RETRY_BACKOFF_MS = [
  2_000, // 2s
  8_000, // 8s
  30_000, // 30s
  120_000, // 2m
  600_000, // 10m
  3_600_000, // 1h (cap)
] as const;

/** Random jitter added to each backoff delay to avoid a thundering herd. */
export const UPLOAD_RETRY_JITTER_RATIO = 0.25;

/** Directory (under documentDirectory) holding captured media awaiting upload. */
export const MEDIA_DIRECTORY = 'incidents/';

/** Feed page size; also the org report inbox page size. */
export const PAGE_SIZE = 20;

/** Number of videos preloaded ahead of the visible feed item. Exactly one. */
export const FEED_PRELOAD_AHEAD = 1;

/**
 * Minimum touch target, in points. Apple's HIG floor is 44 and Android's is 48;
 * we take the larger. Grip strength and fine motor precision decline with age,
 * and the primary reader here is 70+, so the extra 4pt is not padding — it is
 * the difference between hitting "Submit" and hitting "Cancel".
 */
export const MIN_TAP_TARGET = 48;

/**
 * Below this, a stored file is not media.
 *
 * Measured against the live service: real captures from this app are 1.9–3.7 MB,
 * while the integration probes sharing the same queue hold 2 048, 4 096 or
 * 8 192 bytes of random data with no container header at all. 64 KB sits far
 * above every synthetic payload and far below the smallest plausible capture.
 *
 * It matters because a player handed one of those shows 0:00 on a black frame
 * forever, which a reader cannot tell from a slow connection.
 *
 * **Hand-synced with `MIN_PLAUSIBLE_MEDIA_BYTES` in `@dawuro/core`**, which the
 * console and the news-value score use for the same decision. This app does not
 * consume that package — the same reason `NewsSection` is declared twice — so
 * the two must be changed together. They disagreeing would show up as a frame
 * saying "unplayable" beside a score rating the same file 5 out of 5 for
 * footage.
 */
export const MIN_PLAUSIBLE_MEDIA_BYTES = 64_000;
