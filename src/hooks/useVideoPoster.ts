import { useEffect, useSyncExternalStore } from 'react';
import { peekPoster, requestPoster, subscribeToPosters, type Poster } from '@/lib/videoPoster';

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
}): Poster | null {
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

  useEffect(() => {
    if (!wanted || !input.url) return;
    requestPoster(input.id, input.url);
  }, [wanted, input.id, input.url]);

  return poster;
}
