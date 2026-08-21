/** Mean Earth radius in metres (WGS 84 authalic). */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance between two points, in metres.
 *
 * Haversine rather than a projected approximation: over the tens of kilometres
 * this app deals with either would do, but haversine has no failure mode near
 * the equator or across the prime meridian — both of which pass through Ghana.
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A map region that frames both points with margin.
 *
 * The floor on the deltas matters: two points a few metres apart would
 * otherwise produce a region zoomed so far in that the map renders as a single
 * flat tile with no context.
 */
export function regionContaining(a: LatLng, b: LatLng, paddingRatio = 1.6) {
  const midLat = (a.latitude + b.latitude) / 2;
  const midLon = (a.longitude + b.longitude) / 2;
  const latDelta = Math.max(Math.abs(a.latitude - b.latitude) * paddingRatio, 0.01);
  const lonDelta = Math.max(Math.abs(a.longitude - b.longitude) * paddingRatio, 0.01);
  return {
    latitude: midLat,
    longitude: midLon,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}
