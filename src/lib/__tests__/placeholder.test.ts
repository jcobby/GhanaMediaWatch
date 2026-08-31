import { INCIDENT_CATEGORIES } from '@/types/api';
import { placeholderImage, placeholderSource } from '@/lib/placeholder';

/**
 * Every report can draw something.
 *
 * This exists because the previous implementation returned an SVG data URI,
 * which `expo-image` silently declines to render on native — no error, no
 * broken-image icon, just a blank box. Typecheck passed, lint passed, tests
 * passed, and every thumbnail in the app was empty on a device.
 *
 * A test cannot mount a renderer here, but it can hold the two properties that
 * would have caught it: a scene exists for every category, and nothing hands
 * back a URI the platform cannot open.
 */

test('every category has a bundled scene', () => {
  // The one that actually matters. Categories get added; scenes get forgotten.
  const missing = INCIDENT_CATEGORIES.filter((c) => placeholderSource(c) === undefined);
  expect(missing).toEqual([]);
});

test('no category falls through to the same asset as `other` by accident', () => {
  const other = placeholderSource('other');
  const collided = INCIDENT_CATEGORIES.filter(
    (c) => c !== 'other' && placeholderSource(c) === other,
  );
  expect(collided).toEqual([]);
});

test('a placeholder is never an SVG data URI', () => {
  // The specific bug. If this ever passes again, thumbnails are blank on device.
  for (const category of INCIDENT_CATEGORIES) {
    const uri = placeholderImage(`seed-${category}`, category, { width: 400, height: 300 });
    expect(uri.startsWith('data:image/svg')).toBe(false);
  }
});

test('the same category is stable across calls', () => {
  // Fixtures are generated once and compared in snapshots elsewhere; a
  // placeholder that changed between calls would make those flap.
  expect(placeholderImage('a', 'flood')).toBe(placeholderImage('b', 'flood'));
});

test('an unknown category still returns something drawable', () => {
  // Guards the `?? other` fallback: a new category reaching this before its
  // scene is added must degrade to a plain block, not to undefined.
  const unknown = 'not_a_category' as (typeof INCIDENT_CATEGORIES)[number];
  expect(placeholderSource(unknown)).toBe(placeholderSource('other'));
});
