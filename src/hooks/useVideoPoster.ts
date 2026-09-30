import { useEffect, useSyncExternalStore } from 'react';
import {
  peekPoster,
  posterPending,
  requestPoster,
  subscribeToPosters,
  type Poster,
} from '@/lib/videoPoster';

/**
 * The still frame for a report, or null while there is none.
 *
 * A thin reader over `videoPoster`, which holds the queue, the disk cache and
 * the reasoning — see that file for why the phone is cutting frames at all.
 *
 * `useSyncExternalStore` rather than state: the frames live in one module-level
 * store shared by every row, so a frame taken for the lead is already there when
 * the same report scrolls past as a row, with no second seek and no prop
 * threading between two components that do not know about each other.
 */
export function useVideoPoster(input: {
  id: string;
  kind: string;
  url: string | undefined;
  posterUrl: string | undefined;
}): {
  /** The frame, once there is one. */
  poster: Poster | null;
  /**
   * A frame is on its way — queued, or being cut right now.
   *
   * Returned alongside the frame because null alone cannot be drawn honestly.
   * Cutting a frame means opening a player against a remote file and pulling
   * its head down, one report at a time, with an eight-second ceiling; a row
   * near the back of twenty waits a while. Told only "no frame", `Thumbnail`
   * drew its no-picture state straight away and the real frame appeared over
   * it later with no warning. With this it can pulse instead, and fall back
   * only once nothing more is coming.
   */
  pending: boolean;
} {
  /*
   * Only where there is a clip and nothing already stands in for it.
   *
   * A report the service *did* send a poster for must not be re-seeked, and a
   * photo has no frames to take. If the backend ever starts generating posters,
   * this goes false everywhere and the whole mechanism stops running on its own.
   */
  const wanted = input.kind === 'video' && !input.posterUrl && Boolean(input.url);

  const poster = useSyncExternalStore(subscribeToPosters, () =>
    wanted ? peekPoster(input.id) : null,
  );
  /*
   * A second subscription rather than one returning `{ poster, pending }`.
   *
   * `useSyncExternalStore` compares snapshots by identity, so a getter that
   * builds an object returns a new one every check and React re-renders
   * without end. Two snapshots, each a value it already holds, is the shape
   * that store wants.
   */
  const pending = useSyncExternalStore(subscribeToPosters, () =>
    wanted ? posterPending(input.id) : false,
  );

  useEffect(() => {
    if (!wanted || !input.url) return;
    requestPoster(input.id, input.url);
  }, [wanted, input.id, input.url]);

  return { poster, pending };
}
