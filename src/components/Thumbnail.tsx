import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '@/components/ui';
import { categoryIcon } from '@/lib/categoryIcon';
import { categoryHue } from '@/lib/theme';
import type { Poster } from '@/lib/videoPoster';
import type { IncidentCategory } from '@/types/api';

/**
 * A report's image, and the two honest things to show when there isn't one.
 *
 * **What this replaced, and why it had to go.** Twelve bundled PNGs — one per
 * category — each a dusk landscape: a soft glow over a hill silhouette, tinted
 * by category. They were painted underneath every thumbnail unconditionally and
 * a real image faded over them, which meant all three of these looked identical:
 *
 *   - an image that is still downloading
 *   - a report that has no still at all
 *   - an image whose URL failed
 *
 * A reader could not tell any of them from a photograph, which on this product
 * is not a matter of taste. Dawuro's whole claim is that it can say where a file
 * came from; a synthetic landscape sitting in the image slot of a real report
 * quietly breaks that claim, and the reader has no way to know. It was also
 * twelve variations on one composition, so a column of them read as clip-art,
 * and they were near-black on a light page.
 *
 * So the three states are now three different things:
 *
 * | State | What is drawn |
 * | --- | --- |
 * | Loading | A tonal block with the standard pulse. No content, real or invented. |
 * | No image | A flat field in the category's hue with its glyph — graphic, obviously not a photograph. |
 * | Failed | The same field. There is nothing to show and pretending otherwise is the bug. |
 *
 * The floor is still a local view rather than a remote asset, so there is no
 * state in which this component renders nothing.
 *
 * Videos keep their real frame: `lib/videoPoster` cuts one from the clip,
 * because the service generates no poster for video. That is strictly better
 * than anything here and runs before this falls back.
 */

/** True for the fixture-generated URIs that native cannot draw. */
function isUnrenderable(uri: string | undefined): boolean {
  return !uri || uri.startsWith('data:image/svg');
}

/**
 * Two alpha suffixes on the category hue.
 *
 * Hex rather than `rgba(...)` because `categoryHue` returns `#RRGGBB` and an
 * eight-digit hex is the cheapest way to add alpha without parsing it. `12` is
 * about 7% — a tint the eye reads as "this block is about fire" rather than as
 * a coloured card competing with the headline beside it.
 */
const FIELD_ALPHA = '12';
const GLYPH_ALPHA = '66';

/**
 * The honest empty state: a tint and a glyph, flat and unmistakably drawn.
 *
 * The glyph is the part that earns its place. A plain tinted rectangle says only
 * "no picture"; the glyph says what kind of report this is, which is readable
 * before a word of the headline and is the reason the feed can be scanned.
 */
function CategoryField({
  category,
  glyphSize,
}: {
  category: IncidentCategory;
  glyphSize: number;
}) {
  const hue = categoryHue(category);
  return (
    <View
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${hue}${FIELD_ALPHA}`,
      }}
    >
      <Ionicons name={categoryIcon[category]} size={glyphSize} color={`${hue}${GLYPH_ALPHA}`} />
    </View>
  );
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
   * The service sends no poster for a video, and the alternative on screen is
   * the category field below — which is honest, but a real frame from the thing
   * somebody filmed is better. Wins over `uri` and skips the unrenderable check:
   * there is no URL to inspect, because this is either a path we wrote or a
   * native image reference `expo-image` takes as a source directly.
   */
  poster?: Poster | null;
  category: IncidentCategory;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  /** Scaled by the caller — a full-bleed slide needs a larger mark than a row. */
  glyphSize?: number;
}) {
  /**
   * `idle` means the bytes are on their way, not that nothing is happening.
   *
   * Tracked rather than inferred, because "we have a URL" and "the picture is
   * on screen" are different facts and the gap between them is exactly the
   * moment this component exists to handle well.
   */
  const [state, setState] = useState<'idle' | 'loaded'>('idle');
  /** The id of the source that failed, so a different one is still tried. */
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const source: ImageSource | Poster | null =
    poster ?? (isUnrenderable(uri) ? null : { uri, cacheKey });

  /*
   * A failure is remembered against the thing that failed, not against the row.
   *
   * A plain `failed` boolean is a latch: a video's `uri` 404s, the flag sticks,
   * and when `lib/videoPoster` finishes cutting a frame from the clip a moment
   * later — the whole reason that module exists — the new source is never
   * mounted. The row keeps showing the category field for a report that has a
   * real frame sitting ready.
   *
   * Naming which source failed makes recovery fall out of the render instead of
   * needing an effect to unstick it: the poster arriving changes `sourceId`, so
   * the old failure no longer matches and the image mounts. A second failure
   * records the new id.
   */
  const sourceId = poster ? `poster:${cacheKey ?? ''}` : isUnrenderable(uri) ? null : (uri ?? null);
  const expecting = source !== null && failedFor !== sourceId;
  // Downloading: a pulse, and nothing that could be mistaken for the picture.
  const pulsing = expecting && state !== 'loaded';
  // Nothing is coming, or nothing arrived. Say so in a way no one misreads.
  const empty = !expecting;

  return (
    <View style={style} className="overflow-hidden bg-canvas-raise">
      {empty ? <CategoryField category={category} glyphSize={glyphSize} /> : null}

      {/*
        The pulse is the whole loading state, deliberately.

        It fills the frame rather than sitting in a corner, so the block reads as
        "this is becoming a picture" — the same language the feed's own skeleton
        speaks while the list arrives, so the two do not look like different
        kinds of waiting. `Skeleton` already honours reduced motion.
      */}
      {pulsing ? (
        <View style={{ position: 'absolute', width: '100%', height: '100%' }}>
          <Skeleton fill className="rounded-none" />
        </View>
      ) : null}

      {expecting ? (
        <Image
          source={source}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit={contentFit}
          /*
            Long enough to read as an arrival rather than a flash. It fades over
            the pulse, which is a tonal block of the same family, so the change
            is one surface resolving into another.
          */
          transition={220}
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
          onLoad={() => setState('loaded')}
          onError={() => setFailedFor(sourceId)}
        />
      ) : null}
    </View>
  );
}
