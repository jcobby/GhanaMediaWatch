import { useEffect, useSyncExternalStore } from 'react';

/**
 * How the top of the feed behaves — how many stories, and how long each holds.
 *
 * **These belong to the platform desk, not to this file.** A newsroom decides
 * how many stories lead and how long a reader gets with each one; that is an
 * editorial judgement and it changes with the day. The service now publishes
 * them at `GET /v1/settings` — public, and cacheable for five minutes — so the
 * values the desk sets reach every phone without an app release.
 *
 * The defaults below are what the feed uses until that answer arrives, and what
 * it keeps using if it never does. A reader offline, or a service that is down,
 * still gets a working rotation.
 */

/**
 * Stories in the rotation.
 *
 * Five, which is also the ceiling. Enough that a reader who waits sees a spread
 * of the day rather than one story; few enough that the last one is still
 * recent, and that a reader who scrolls past reaches the ordinary rows quickly.
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

/**
 * How much of a video top story plays before the rotation moves on.
 *
 * Five seconds **of footage** — counted from the moment the clip is actually
 * moving, not from the moment its slide appears. Timed from the slide, a clip
 * that took three seconds to buffer its first frame over mobile data was swapped
 * away before a single frame showed, and the rotation looked like five still
 * pictures. Readers were shown the thumbnail and told nothing.
 *
 * Deliberately not the configurable dwell. That number is about reading time on
 * a headline; this one is about how much of somebody's data an autoplaying
 * video is allowed to spend, and they should not move together by accident.
 */
export const VIDEO_PREVIEW_MS = 5000;

/**
 * How long to wait for a clip to start before giving up on it.
 *
 * A dead link, an expired signature or a codec the phone cannot decode never
 * starts at all, and a rotation waiting for it would stall on a still frame
 * forever. After this long the slide is treated like a photograph and moves on.
 */
export const VIDEO_START_TIMEOUT_MS = 8000;

/** The narrowest and widest the desk may set, whatever arrives on the wire. */
export const DWELL_MS_RANGE = { min: 3000, max: 20_000 } as const;
/**
 * At most five.
 *
 * A rotation is a front page, and a front page with ten leads has none. Five is
 * also as many as a reader will sit through before the first one comes back
 * round — beyond that the last stories are shown to nobody, and each one is a
 * video the app may have spent data on.
 */
export const COUNT_RANGE = { min: 1, max: 5 } as const;

export interface TopStorySettings {
  count: number;
  dwellMs: number;
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

/*
 * One copy for the whole app.
 *
 * A stable object, not a fresh one per call: `useSyncExternalStore` compares
 * snapshots by identity, and a new object on every read would re-render the
 * feed forever.
 */
const DEFAULTS: TopStorySettings = sanitise(null);
let served: TopStorySettings | null = null;
let loading = false;
const listeners = new Set<() => void>();

/** The settings in force: what the service said, or the defaults until it has. */
export function topStorySettings(): TopStorySettings {
  return served ?? DEFAULTS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ask the service once per launch.
 *
 * A plain `fetch` rather than the API client: the endpoint is public and needs
 * no token, and the feed must not wait on a device registration to learn how
 * long a slide holds. Only against the live backend — the fixtures have no
 * settings to serve.
 *
 * A failure is not remembered, so the next feed visit tries again.
 */
export async function loadTopStorySettings(): Promise<void> {
  if (served || loading) return;
  const origin = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (process.env.EXPO_PUBLIC_API_MODE !== 'http' || !origin) return;

  loading = true;
  try {
    const res = await fetch(`${origin}/v1/settings`, {
      // A dev tunnel answers an unrecognised client with an HTML page without it.
      headers: { 'X-Tunnel-Skip-AntiPhishing-Page': 'true' },
    });
    if (!res.ok) return;
    const body = (await res.json()) as {
      feed?: { topStoryCount?: unknown; topStoryDwellMs?: unknown };
    };
    // Data from a network, not a promise: clamped like anything the desk types.
    served = sanitise({
      count: body.feed?.topStoryCount as number | undefined,
      dwellMs: body.feed?.topStoryDwellMs as number | undefined,
    });
    for (const listener of listeners) listener();
  } catch {
    // Offline, or the service is down. The defaults stand.
  } finally {
    loading = false;
  }
}

/** The settings in force, re-rendering when the service's answer arrives. */
export function useTopStorySettings(): TopStorySettings {
  const settings = useSyncExternalStore(subscribe, topStorySettings, topStorySettings);
  useEffect(() => {
    void loadTopStorySettings();
  }, []);
  return settings;
}
