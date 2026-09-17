import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { categoryIcon } from '@/lib/categoryIcon';
import type { Poster } from '@/lib/videoPoster';
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
  whistleblower: require('../../assets/placeholders/corruption.png'),
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
  poster,
  cacheKey,
  category,
  style,
  contentFit = 'cover',
  glyphSize = 26,
}: {
  /** The address the service published for this report's still, if it published one. */
  uri: string | undefined;
  /**
   * A name for this image that does not change when its URL does.
   *
   * **Why the feed reloads every picture, every time.** Media URLs are signed:
   * `/v1/media/{id}?exp=…&sig=…`, with a fresh deadline and therefore a fresh
   * signature on every API response. `expo-image` keys its cache on the URL
   * unless told otherwise, so the same photograph arrived under a different key
   * on each load and was downloaded again from scratch — the cache could never
   * hit, and closing and reopening the app re-fetched the entire feed.
   *
   * Pass the incident id. Media is one-to-one with a report, so it identifies
   * the bytes exactly and never changes.
   */
  cacheKey?: string;
  /**
   * A frame the phone cut from the clip itself.
   *
   * The service sends no poster for a video, and the alternative on screen is a
   * drawing of the category — a column of raindrops where a column of scenes
   * should be. Wins over `uri` and skips the unrenderable check below: there is
   * no URL to inspect, because this is either a path we wrote or a native image
   * reference `expo-image` takes as a source directly. See `lib/videoPoster`.
   */
  poster?: Poster | null;
  category: IncidentCategory;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  /** Scaled by the caller — a full-bleed slide needs a larger mark than a row. */
  glyphSize?: number;
}) {
  const [failed, setFailed] = useState(false);

  const scene = SCENES[category] ?? SCENES.other;
  const source: ImageSource | Poster | null =
    poster ?? (isUnrenderable(uri) ? null : { uri, cacheKey });
  const showReal = source !== null && !failed;

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

      {/*
        The category glyph, over the placeholder only.
        A synthetic gradient says nothing on its own — six of them in a column
        read as six loading states. The glyph turns each into a statement of
        what kind of report it is, readable before a word of the headline.

        It is deliberately not drawn over a real photograph: there it would be
        clutter obscuring the thing the reader came to see.
      */}
      {!showReal ? (
        <View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={categoryIcon[category]} size={glyphSize} color="rgba(255,255,255,0.32)" />
        </View>
      ) : null}

      {showReal ? (
        <Image
          source={source}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit={contentFit}
          transition={160}
          /*
            Decoded frames stay in memory as well as on disk. The default keeps
            only the file, so scrolling a feed back up re-decoded every image it
            had already drawn — cheap next to a download, but it is the pause
            you feel when a list does not scroll smoothly.
          */
          cachePolicy="memory-disk"
          /*
            Rows are recycled as the list scrolls. Without this the view keeps
            drawing the previous report's picture until the new one decodes, so
            a fast scroll shows the wrong photograph against the right headline.
          */
          recyclingKey={cacheKey}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}
