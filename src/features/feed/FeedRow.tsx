import { memo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { Thumbnail } from '@/components/Thumbnail';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import type { Incident } from '@/types/api';

/**
 * One report in the feed, as a news row.
 *
 * The structure of the news apps people here already read: a large picture on
 * the left, the headline beside it, and one quiet line of when and where. No
 * dividers — whitespace separates the rows — and no colour on the text, so the
 * pictures carry the page.
 *
 * The picture is a share of the screen rather than a fixed 112px, so it stays
 * the same proportion of the row on a small phone and a large one. Exact sizes
 * go through `style`: arbitrary Tailwind values do not compile in this
 * NativeWind setup, and a thumbnail that collapses to nothing is how this row
 * once rendered as bare text.
 */
export const FeedRow = memo(function FeedRow({
  incident,
  onOpen,
}: {
  incident: Incident;
  onOpen: (incident: Incident) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isVideo = incident.media.kind === 'video';
  const isAudio = incident.media.kind === 'audio';

  /** About two fifths of the screen, landscape, as in a newspaper's index. */
  const thumbWidth = Math.round(width * 0.4);
  const thumbHeight = Math.round(thumbWidth * 0.58);

  /*
   * The service's 320px copy, which is what a row this size needs — the poster
   * or the photo itself was a full-size file drawn into a small box. Reports
   * stored before the service made copies have none, and fall back to the
   * poster as before.
   */
  const still = incident.media.thumbUrl || incident.media.posterUrl;

  /*
   * A frame cut on the phone, only for a clip the service has no still for yet.
   * The work behind it is queued one job at a time and kept on disk, so twenty
   * rows are not twenty downloads; see `lib/videoPoster`.
   */
  const poster = useVideoPoster({
    id: incident.id,
    kind: incident.media.kind,
    url: incident.media.url,
    posterUrl: still,
  });

  /*
   * The organisation a report is credited to, when an organisation released it.
   * Only that branch of the publisher union has a name worth showing here — a
   * citizen report is not given an institution it does not have.
   */
  const source =
    incident.publisher.kind === 'organisation'
      ? { name: incident.publisher.displayName, verified: incident.publisher.verified }
      : null;

  const when = formatRelativeTime(incident.publishedAt);
  // Where it happened, or — when the reporter withheld that — what it is.
  const where = placeOf(incident) ?? t(`category.${incident.category}`);

  return (
    <Pressable
      onPress={() => onOpen(incident)}
      accessibilityLabel={incident.description}
      className="flex-row bg-canvas"
      style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 12 }}
    >
      <View style={{ width: thumbWidth, height: thumbHeight }}>
        <Thumbnail
          uri={still}
          cacheKey={incident.id}
          poster={poster}
          category={incident.category}
          style={{ width: thumbWidth, height: thumbHeight, borderRadius: 2 }}
        />

        {isVideo || isAudio ? (
          <View
            style={{ position: 'absolute', bottom: 6, left: 6, width: 22, height: 22 }}
            className="items-center justify-center rounded-pill bg-black/60"
          >
            <Ionicons
              name={isAudio ? 'mic' : 'play'}
              size={12}
              color={c.textOnDark}
              style={isVideo ? { marginLeft: 1 } : undefined}
            />
          </View>
        ) : null}
      </View>

      <View className="flex-1">
        <Text
          variant="body"
          className="font-sans-semibold"
          style={{ fontSize: 17, lineHeight: 23 }}
          numberOfLines={3}
        >
          {incident.description}
        </Text>

        {/*
          "Ghana News Agency • 2 hours ago • Accra" — who it is from, then when,
          then where. The organisation leads because it is the first thing a
          reader weighs: a report released by a named institution is a
          different claim from one a citizen filed.
        */}
        <Text variant="body-sm" tone="faint" numberOfLines={1} style={{ marginTop: 6 }}>
          {source ? (
            <Text variant="body-sm" tone="secondary" className="font-sans-semibold">
              {source.verified ? `${source.name} ✓` : source.name}
              {'  •  '}
            </Text>
          ) : null}
          {when ? `${when}  •  ${where}` : where}
        </Text>
      </View>
    </Pressable>
  );
});

/**
 * The place to show for a report, or null when there is none to show.
 *
 * `location.label` first — it is what the server resolved and what the console
 * stamps on the frame, so the two agree. `landmark` is the reporter's own words
 * and the better answer when no label was resolved: "opposite Kaneshie First
 * Light" locates something for a Ghanaian reader that a coordinate does not.
 *
 * Null when both are missing or blank, so nothing invents a place for a report
 * whose author chose not to give one.
 */
function placeOf(incident: Incident): string | null {
  const label = incident.location?.label?.trim();
  if (label) return label;

  // Read off the record rather than declared on the type: the public feed is a
  // narrower projection and has not been seen to carry `landmark`.
  const landmark = (incident as { landmark?: string | null }).landmark?.trim();
  return landmark || null;
}
