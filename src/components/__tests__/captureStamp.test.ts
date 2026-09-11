import fs from 'fs';
import path from 'path';
import { formatCoordinates } from '@/lib/format';

/**
 * Where the footage was taken, said out loud.
 *
 * The stamp printed a time and nothing else on every published report. Not
 * because the location was missing — the fix was on the record, at
 * `5.602735, -0.218041`, and the reporter had chosen to show it — but because
 * the stamp read only `location.label`, and the service resolves a place name
 * for nothing it holds. Every incident comes back `"label": null`.
 *
 * The screen whose whole claim is that this was filmed *here* was therefore
 * silent about where, and a reader could not tell that from a reporter who had
 * deliberately withheld the location. Those two are opposite facts and had one
 * appearance.
 */

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

describe('coordinates as a place name', () => {
  test('a Ghanaian fix reads with hemispheres, not a minus sign', () => {
    // Ghana straddles the prime meridian, so "-0.218" reads as a typo.
    expect(formatCoordinates(5.602735, -0.218041)).toBe('5.6027° N, 0.2180° W');
    expect(formatCoordinates(-1.5, 36.8)).toBe('1.5000° S, 36.8000° E');
  });

  test('four decimals — the accuracy a phone fix actually has', () => {
    /*
     * About eleven metres. More places would claim a precision the capture
     * cannot support, on a stamp whose whole job is being believable.
     */
    const [lat] = formatCoordinates(5.6027351234, -0.2180412345)!.split(',');
    expect(lat!.replace(/[^0-9.]/g, '')).toBe('5.6027');
  });

  test('no fix is nothing, never a placeholder', () => {
    /*
     * A withheld location arrives with no coordinates. Printing "Unknown" there
     * would advertise that something was hidden, which is the one thing the
     * stamp must not do — the same rule the feed row's place line follows.
     */
    expect(formatCoordinates(null, null)).toBeNull();
    expect(formatCoordinates(5.6, null)).toBeNull();
    expect(formatCoordinates(undefined, undefined)).toBeNull();
    expect(formatCoordinates(Number.NaN, 0)).toBeNull();
  });
});

describe('the stamp uses it', () => {
  test('a name is preferred, and the fix is the last resort', () => {
    /*
     * Three answers in order, and the order is the whole point. The service's
     * own label if it ever sends one; then a name the phone's geocoder
     * resolved, because "Abelenkpe, Accra" is what somebody deciding whether a
     * fire is near them can actually use; and only then the coordinates, which
     * are true, checkable and no use for that question.
     */
    const stamp = code('components/CaptureStamp.tsx');
    expect(stamp).toMatch(/incident\.location\.label \?\?\s*resolved \?\?/);
    expect(stamp).toMatch(
      /formatCoordinates\(incident\.location\.latitude, incident\.location\.longitude\)/,
    );
    expect(stamp).toMatch(/usePlaceName\(incident\.location\.latitude/);
  });

  test('the lookup happens before the early return, because it is a hook', () => {
    // `newsroom` copy returns above the stamp. A hook called after it would run
    // conditionally and React would throw on the first wire story in the feed.
    const stamp = code('components/CaptureStamp.tsx');
    expect(stamp.indexOf('usePlaceName(')).toBeLessThan(stamp.indexOf("origin === 'newsroom'"));
  });

  test('a geocode nobody can perform costs nothing', () => {
    /*
     * Reverse geocoding needs foreground location permission, which most
     * readers have never granted — the feed does not ask for it. A refusal is
     * remembered as a miss so a scrolling feed does not retry on every row, and
     * the stamp shows the fix exactly as it did before.
     */
    const hook = code('hooks/usePlaceName.ts');
    expect(hook).toMatch(/catch \{/);
    expect(hook).toMatch(/cache\.set\(key, null\)/);
  });

  test('a suppressed location still renders nothing at all', () => {
    // The whole row is conditional on there being something to say.
    const stamp = code('components/CaptureStamp.tsx');
    expect(stamp).toMatch(/if \(!when && !where\) return null;/);
    expect(stamp).toMatch(/\{where \?/);
  });

  test('a wire dateline is never a coordinate', () => {
    /*
     * `newsroom` copy has no capture behind it — no person, no fix, no GPS
     * gate. A latitude on an agency story would be inventing provenance it
     * does not have, which is the whole reason the branch exists.
     */
    const stamp = code('components/CaptureStamp.tsx');
    const wire = stamp.slice(stamp.indexOf("origin === 'newsroom'"));
    expect(wire.slice(0, 400)).toMatch(/const dateline = incident\.location\.label;/);
    expect(wire.slice(0, 400)).not.toMatch(/formatCoordinates/);
  });
});
