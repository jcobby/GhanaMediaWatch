/**
 * A plus code for a point, worked out on the phone.
 *
 * Many places a report is filmed in Ghana have no street name a geocoder knows,
 * and "Kaneshie, Accra" covers a square kilometre. A plus code names a roughly
 * 14 × 14 metre square, anyone can paste it into a map app, and — unlike an
 * address — it needs no lookup: it is arithmetic on the coordinates, so it works
 * offline at the moment of filing. The Ghana Post GPS address system is built on
 * the same idea.
 *
 * The Open Location Code algorithm, 10 digits: five pairs of latitude and
 * longitude digits in base 20, at 20°, 1°, 1/20°, 1/400° and 1/8000°.
 */

const ALPHABET = '23456789CFGHJMPQRVWX';

/** Units of 1/8000 of a degree — the resolution of a 10-digit code. */
const PER_DEGREE = 8000;

export interface PlusCode {
  /** e.g. `6CQ4+XP8F` — globally unique. */
  full: string;
  /** The last six digits, e.g. `Q4XP+8F`, which need a nearby town to resolve. */
  short: string;
}

export function encodePlusCode(latitude: number, longitude: number): PlusCode | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const lat = Math.min(Math.max(latitude, -90), 90);
  // Longitude wraps: 190° is the same meridian as -170°.
  const lng = ((((longitude + 180) % 360) + 360) % 360) - 180;

  // Rounded before flooring, so 47.36559 × 8000 does not land a hair under a boundary.
  let latUnits = Math.floor(Math.round((lat + 90) * PER_DEGREE * 1e6) / 1e6);
  let lngUnits = Math.floor(Math.round((lng + 180) * PER_DEGREE * 1e6) / 1e6);
  // The north pole itself belongs to the last cell, not one past it.
  latUnits = Math.min(latUnits, 180 * PER_DEGREE - 1);
  lngUnits = Math.min(lngUnits, 360 * PER_DEGREE - 1);

  let digits = '';
  for (let pair = 0; pair < 5; pair += 1) {
    digits = ALPHABET[latUnits % 20]! + ALPHABET[lngUnits % 20]! + digits;
    latUnits = Math.floor(latUnits / 20);
    lngUnits = Math.floor(lngUnits / 20);
  }

  const full = `${digits.slice(0, 8)}+${digits.slice(8)}`;
  return { full, short: full.slice(4) };
}

/** A plus code with the town that makes its short form unambiguous. */
export function plusCodeLabel(code: PlusCode, locality: string | null): string {
  return locality ? `${code.short}, ${locality}` : code.full;
}
