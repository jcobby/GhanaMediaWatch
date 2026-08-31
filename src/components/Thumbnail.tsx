import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { IncidentCategory } from '@/types/api';

/**
 * A report's image, with a fallback that always renders.
 *
 * Two problems this exists to solve, both of which showed up as an empty feed:
 *
 * 1. **`expo-image` cannot render an SVG data URI on native.** The fixtures
 *    generate one per report — no network, deterministic, fine on web — and
 *    every thumbnail silently came back blank on a device. There is no error
 *    to catch; the image simply never paints.
 *
 * 2. A real `posterUrl` can 404 or time out on a bad connection, which is the
 *    normal case in the field rather than the exception.
 *
 * So: a bundled PNG per category is the floor, and a real URL is drawn over it
 * when there is one and it loads. The floor is a local asset, so it cannot
 * fail — there is no state in which this component shows nothing.
 */

/**
 * `require` needs a literal path, so the map is written out rather than built.
 * Adding a category without adding a scene here falls back to `other`, which
 * is the right failure: a plain block, never a missing one.
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

/** True for the fixture-generated URIs that native cannot draw. */
function isUnrenderable(uri: string | undefined): boolean {
  return !uri || uri.startsWith('data:image/svg');
}

export function Thumbnail({
  uri,
  category,
  style,
  contentFit = 'cover',
}: {
  uri: string | undefined;
  category: IncidentCategory;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
}) {
  const [failed, setFailed] = useState(false);

  const scene = SCENES[category] ?? SCENES.other;
  const showReal = !isUnrenderable(uri) && !failed;

  return (
    <View style={style} className="overflow-hidden bg-canvas-raise">
      {/* The scene sits underneath rather than instead of, so a slow real
          image fades in over something rather than over an empty box. */}
      <Image
        source={scene}
        style={{ position: 'absolute', width: '100%', height: '100%' }}
        contentFit="cover"
        transition={0}
      />

      {showReal ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit={contentFit}
          transition={160}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}
