import { encodePlusCode, plusCodeLabel } from '../plusCode';
import { describePlace } from '@/hooks/useCaptureAddress';

/**
 * The plus code shown and sent with every report.
 *
 * Arithmetic, so it is checked against the Open Location Code reference value
 * rather than trusted: a code off by one digit points at a different building.
 */

test('matches the Open Location Code reference', () => {
  // From the specification's own worked example.
  expect(encodePlusCode(47.36559, 8.524997)?.full).toBe('8FVC9G8F+6X');
});

test('a point in Accra has a well-formed code', () => {
  const code = encodePlusCode(5.5731, -0.2325)!;
  expect(code.full).toMatch(/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$/);
  // Ghana sits in the 6C cell.
  expect(code.full.startsWith('6C')).toBe(true);
  expect(code.short).toBe(code.full.slice(4));
});

test('longitude wraps and the poles do not overflow', () => {
  expect(encodePlusCode(10, 190)?.full).toBe(encodePlusCode(10, -170)?.full);
  expect(encodePlusCode(90, 0)?.full).toMatch(/^C/);
  expect(encodePlusCode(Number.NaN, 0)).toBeNull();
});

test('the short form is only used with a town to anchor it', () => {
  const code = encodePlusCode(5.5731, -0.2325)!;
  expect(plusCodeLabel(code, 'Accra')).toBe(`${code.short}, Accra`);
  expect(plusCodeLabel(code, null)).toBe(code.full);
});

test('an address is built from the street down, without repeats or plus-code names', () => {
  const place = describePlace({
    name: '6CQ4H4GH+2V',
    street: 'Ring Road West',
    streetNumber: null,
    district: 'Kaneshie',
    subregion: null,
    city: 'Accra',
    region: 'Greater Accra',
    country: 'Ghana',
    postalCode: null,
    isoCountryCode: 'GH',
    timezone: null,
    formattedAddress: null,
  });
  expect(place).toEqual({
    street: 'Ring Road West',
    address: 'Ring Road West, Kaneshie, Accra, Greater Accra',
    locality: 'Accra',
  });

  const noStreet = describePlace({
    name: '6CQ4H4GH+2V',
    street: null,
    streetNumber: null,
    district: null,
    subregion: null,
    city: 'Accra',
    region: 'Accra',
    country: 'Ghana',
    postalCode: null,
    isoCountryCode: 'GH',
    timezone: null,
    formattedAddress: null,
  });
  // The plus code the geocoder put in `name` is not a street.
  expect(noStreet).toEqual({ street: null, address: 'Accra', locality: 'Accra' });
});
