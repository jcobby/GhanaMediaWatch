import { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { encodePlusCode, type PlusCode } from '@/lib/plusCode';

/**
 * Where a capture was filmed, in words a reader can use.
 *
 * The review screen's preview used to say "Kaneshie, Accra" for every report,
 * wherever it was filmed — a hard-coded string standing in for a lookup nobody
 * had written. This asks the phone's own geocoder for the street and address,
 * and works out the plus code from the coordinates, which needs no network at
 * all: a reporter filing from somewhere with no signal still sees a precise,
 * shareable location.
 *
 * `usePlaceName` answers a different question — a short area name for a feed
 * caption — so this is its own hook rather than a second mode of that one.
 */

export interface CaptureAddress {
  /** Still asking the geocoder. The plus code is available immediately. */
  loading: boolean;
  /** "12 Ring Road" or "Kojo Thompson Road", or null when there is none. */
  street: string | null;
  /** The whole address, street to region, without repeats. */
  address: string | null;
  /** The town or city, which makes a short plus code unambiguous. */
  locality: string | null;
  plusCode: PlusCode | null;
}

/** An Android geocoder often returns a plus code as the place "name". */
const LOOKS_LIKE_PLUS_CODE = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]*/i;

export function describePlace(place: Location.LocationGeocodedAddress): Omit<CaptureAddress, 'loading' | 'plusCode'> {
  const road = [place.streetNumber, place.street].filter(Boolean).join(' ').trim();
  const name = place.name && !LOOKS_LIKE_PLUS_CODE.test(place.name) && !/^\d+$/.test(place.name) ? place.name : null;
  const street = road || name;

  const parts = [street, place.district ?? place.subregion, place.city, place.region];
  const seen = new Set<string>();
  const unique = parts.filter((part): part is string => {
    if (!part) return false;
    const key = part.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    street: street || null,
    address: unique.length ? unique.join(', ') : null,
    locality: place.city ?? place.district ?? place.subregion ?? place.region ?? null,
  };
}

export function useCaptureAddress(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): CaptureAddress {
  const usable =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  const key = usable ? `${latitude},${longitude}` : null;

  const plusCode = useMemo(
    () => (usable ? encodePlusCode(latitude, longitude) : null),
    [usable, latitude, longitude],
  );

  const [found, setFound] = useState<{
    key: string;
    place: Omit<CaptureAddress, 'loading' | 'plusCode'> | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !usable) return;
    let cancelled = false;
    void (async () => {
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (!cancelled) setFound({ key, place: place ? describePlace(place) : null });
      } catch {
        // No permission, no network, or no geocoder: the plus code still stands.
        if (!cancelled) setFound({ key, place: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, usable, latitude, longitude]);

  const current = found?.key === key ? found : null;
  return {
    loading: Boolean(key) && current === null,
    street: current?.place?.street ?? null,
    address: current?.place?.address ?? null,
    locality: current?.place?.locality ?? null,
    plusCode,
  };
}
