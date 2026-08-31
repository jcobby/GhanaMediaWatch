import { Image } from 'react-native';
import type { IncidentCategory } from '@/types/api';

/**
 * Locally generated placeholder imagery.
 *
 * The fixtures used to point at loremflickr.com. That service returned HTTP 500
 * and every image in both products became a broken link — during a demo, which
 * is exactly when it matters. A seeded demo must not have a network dependency
 * for its own screenshots.
 *
 * That was replaced with inline SVG data URIs, which was worse in a way that
 * did not show up until a device was in hand: **`expo-image` does not render
 * `data:image/svg+xml` on native.** It fails silently — no error, no broken
 * icon, just an image that never paints. Every thumbnail in the app was blank
 * while every check passed.
 *
 * So these are now bundled PNGs, resolved to a real URI. Metro serves them in
 * development and they ship in the binary for production, so the value handed
 * to an `<Image>` is an ordinary URL that any renderer understands.
 *
 * They are deliberately abstract rather than pretending to be photographs — a
 * synthetic image that admits what it is beats a stock sunset standing in for a
 * two-car collision. Composition is a horizon: lit sky above, dark mass below,
 * one light source, which is enough to read as a scene at thumbnail size.
 */

/**
 * `require` needs a literal path, so this map is written out.
 *
 * A category with no scene falls back to `other` — a plain block rather than a
 * missing one, which is the right way for this to fail.
 */
const SCENES: Record<string, number> = {
  fire: require('../../assets/placeholders/fire.png'),
  accident: require('../../assets/placeholders/accident.png'),
  disorder: require('../../assets/placeholders/disorder.png'),
  infrastructure: require('../../assets/placeholders/infrastructure.png'),
  utility: require('../../assets/placeholders/utility.png'),
  corruption: require('../../assets/placeholders/corruption.png'),
  environment: require('../../assets/placeholders/environment.png'),
  wildlife: require('../../assets/placeholders/wildlife.png'),
  flood: require('../../assets/placeholders/flood.png'),
  crime: require('../../assets/placeholders/crime.png'),
  health: require('../../assets/placeholders/health.png'),
  other: require('../../assets/placeholders/other.png'),
};

/** The bundled asset for a category, as a module id. */
export function placeholderSource(category: IncidentCategory): number {
  return SCENES[category] ?? SCENES.other!;
}

/**
 * A URI for a report's placeholder.
 *
 * Returns a string rather than a module id because that is what the fixtures
 * and the `IncidentMedia` shape expect — a URL. `resolveAssetSource` is what
 * turns a bundled asset into one.
 *
 * `seed` and `size` are accepted and unused. Callers pass a report id and the
 * dimensions they want, which the SVG generator honoured by drawing per report;
 * a fixed set of bundled scenes shares one per category instead, and the
 * consumer scales it. Keeping the parameters means no call site changed when
 * the implementation did, and none has to change again if per-report variants
 * are generated later.
 */
export function placeholderImage(
  _seed: string,
  category: IncidentCategory,
  _size?: { width: number; height: number },
): string {
  const resolved = Image.resolveAssetSource(placeholderSource(category));
  return resolved?.uri ?? '';
}
