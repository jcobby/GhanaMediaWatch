import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/**
 * The name of the place a report was filmed.
 *
 * **The service resolves none.** Every incident comes back `"label": null` with
 * the fix that produced it on the same object, and `LocationInput` has no field
 * for a client to supply one — so nothing in the platform has ever put a name
 * to a report. The stamp fell back to `5.6028° N, 0.2179° W`, which is true,
 * checkable, and no use at all to somebody deciding whether a fire is near
 * them. The same point is **Abelenkpe, Accra**.
 *
 * The phone can answer this for free. `expo-location` hands the coordinates to
 * the operating system's own geocoder — no key, no account, no request of ours
 * leaving the device to a third party.
 *
 * **A stopgap, and the second copy of one.** The console resolves the same
 * names against a web geocoder for the same reason. Both should be deleted the
 * day the service resolves a label at ingest: one lookup per report instead of
 * one per reader per screen. Requested as item 11 in BACKEND-REQUESTS.
 *
 * Returns null until it has an answer, and null forever if it cannot get one —
 * the caller keeps whatever it was already showing rather than flashing a
 * placeholder in and out.
 */

/** Resolved names for this launch, so a feed scrolled twice asks once. */
const cache = new Map<string, string | null>();

/** ~110 m. A suburb name does not change inside that, and it shares a cache. */
const keyOf = (latitude: number, longitude: number) =>
  `${latitude.toFixed(3)},${longitude.toFixed(3)}`;

/**
 * The shortest name that locates the report for a Ghanaian reader.
 *
 * District then city — "Abelenkpe, Accra" is how somebody in Accra says where
 * that is. The full postal address reads as noise on a caption over footage.
 */
function shortLabel(place: Location.LocationGeocodedAddress): string | null {
  const local = place.district ?? place.subregion ?? place.name ?? null;
  const wider = place.city ?? place.region ?? null;

  if (local && wider && local !== wider) return `${local}, ${wider}`;
  return local ?? wider ?? null;
}

export function usePlaceName(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  const usable =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const key = usable ? keyOf(latitude, longitude) : null;

  /*
   * State holds only what *this* hook fetched, and render reads the cache
   * directly.
   *
   * The obvious shape — seed state from the cache, then `setLabel` in the
   * effect on a hit — writes state synchronously inside an effect for a value
   * that was available during render, which is a cascading render for nothing.
   * A point already in the cache is answered below without this ever being set.
   */
  const [fetched, setFetched] = useState<{ key: string; label: string | null } | null>(null);

  useEffect(() => {
    // Already known — render reads it straight from the cache.
    if (!key || !usable || cache.has(key)) return;

    let cancelled = false;
    void (async () => {
      try {
        /*
         * Geocoding is gated on foreground location permission on both
         * platforms. A reader who has never granted it — most readers, since
         * the feed does not need it — simply gets no name, which is the same
         * outcome as a geocoder that has nothing for this point.
         */
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const resolved = place ? shortLabel(place) : null;
        cache.set(key, resolved);
        if (!cancelled) setFetched({ key, label: resolved });
      } catch {
        // Permission refused, no network, or the platform has no geocoder.
        // Remembered as a miss so a scrolling feed does not retry per row.
        cache.set(key, null);
        if (!cancelled) setFetched({ key, label: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, usable, latitude, longitude]);

  if (!key) return null;
  // The cache first, so a point another row already resolved needs no fetch and
  // no render of its own. `fetched` is only ever this hook's own answer, and is
  // checked against the current key so a recycled row cannot show a stale name.
  return cache.get(key) ?? (fetched?.key === key ? fetched.label : null);
}
