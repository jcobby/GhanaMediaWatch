/**
 * How the top of the feed behaves — how many stories, and how long each holds.
 *
 * **These belong to the platform desk, not to this file.** A newsroom decides
 * how many stories lead and how long a reader gets with each one; that is an
 * editorial judgement and it changes with the day. The console has the control
 * for it. What is missing is the wire between them: the service has no endpoint
 * that carries a platform setting, so nothing the desk sets can reach a phone
 * yet. Item 8 in BACKEND-REQUESTS asks for the route that closes it.
 *
 * Until then these are the defaults, in one place, and `topStorySettings()` is
 * the single function the served value gets read into. Nothing else in the app
 * reads the constants directly, so wiring it up later is one function body
 * rather than a hunt.
 *
 * **Deliberately not fetched speculatively.** Calling an endpoint that does not
 * exist would 404 on every feed load, and a client that asks for a field it
 * invented is how a contract gets confused for a bug later.
 */

/**
 * Stories in the rotation.
 *
 * Five. Enough that a reader who waits sees a spread of the day rather than one
 * story; few enough that the last one is still recent, and that a reader who
 * scrolls past reaches the ordinary rows quickly. It is also the ceiling on how
 * many video frames the carousel asks for at once.
 */
const DEFAULT_COUNT = 5;

/**
 * How long each story holds, in milliseconds.
 *
 * Six seconds. Long enough to read a four-line headline and decide, which is
 * the whole job of a lead — a carousel that moves before somebody has finished
 * reading is worse than one that does not move at all, because it takes the
 * story away and gives them no way to ask for it back. Short enough that
 * somebody watching it idle sees a second story rather than assuming it is
 * broken.
 */
const DEFAULT_DWELL_MS = 6000;

/** The narrowest and widest the desk may set, whatever arrives on the wire. */
export const DWELL_MS_RANGE = { min: 3000, max: 20_000 } as const;
export const COUNT_RANGE = { min: 1, max: 10 } as const;

export interface TopStorySettings {
  count: number;
  dwellMs: number;
}

/**
 * The settings in force.
 *
 * When the service begins carrying them, read them here and clamp them through
 * `sanitise` — a served value is data from a network, not a promise.
 */
export function topStorySettings(): TopStorySettings {
  return sanitise({ count: DEFAULT_COUNT, dwellMs: DEFAULT_DWELL_MS });
}

/**
 * A served setting made safe to render.
 *
 * Zero stories would empty the top of the feed; a dwell of 200ms would be a
 * strobe, and one of an hour would be a carousel that never moves while
 * claiming to. Both are things a typo in an admin field produces, and neither
 * should be able to reach a reader.
 */
export function sanitise(input: Partial<TopStorySettings> | null | undefined): TopStorySettings {
  return {
    count: clamp(input?.count, DEFAULT_COUNT, COUNT_RANGE.min, COUNT_RANGE.max),
    dwellMs: clamp(input?.dwellMs, DEFAULT_DWELL_MS, DWELL_MS_RANGE.min, DWELL_MS_RANGE.max),
  };
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
