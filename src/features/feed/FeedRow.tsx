import { memo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { categoryHue, useColors } from '@/lib/theme';
import { formatCount, formatRelativeTime } from '@/lib/format';
import { Thumbnail } from '@/components/Thumbnail';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import type { Incident } from '@/types/api';

/** Big enough to read a scene at arm's length, small enough for seven a screen. */
const THUMB_W = 112;
const THUMB_H = 86;

/**
 * One report in the feed, as a news row.
 *
 * Replaces the card. A card gives each report a full screen-width image and an
 * action bar, which suits a social feed where the unit of interest is the post
 * — but people do not read this feed that way. They are scanning for whether
 * something near them has been reported, and a card format shows three items
 * per screen where a row shows seven.
 *
 * Thumbnail left, headline right, one line of context beneath. The reader gets
 * subject, recency and category in a single fixation, which is the whole job of
 * a list like this.
 *
 * The reactions and share that lived on the card move to the detail screen.
 * There is no honest room for them here, and a row of icons under every item
 * would undo the density the layout exists for.
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
  const hue = categoryHue(incident.category);
  const isVideo = incident.media.kind === 'video';
  const isAudio = incident.media.kind === 'audio';

  /*
   * A frame from the clip, because the service sends no poster for one.
   *
   * A column of category drawings — a raindrop, a flame, a raindrop again —
   * reads as clip-art rather than as reports, and it is the same picture for
   * every flood in the country. The work behind this is queued one job at a
   * time and kept on disk, so twenty rows are not twenty downloads; see
   * `lib/videoPoster` for why that is affordable.
   */
  const poster = useVideoPoster({
    id: incident.id,
    kind: incident.media.kind,
    url: incident.media.url,
    posterUrl: incident.media.posterUrl,
  });

  return (
    <Pressable
      onPress={() => onOpen(incident)}
      accessibilityLabel={incident.description}
      /* On the page rather than on the ground behind it. The list reads as one
         white column with hairlines between items, and the soft ground is left
         to do the one job it is good at: separating the lead from the rest. */
      className="flex-row gap-3 bg-canvas px-4 py-3.5"
    >
      {/* ── Thumbnail ───────────────────────────────────────────────────── */}
      {/*
        Exact sizes go through `style`, not `w-[112px]`.

        Nothing else in this app sizes with arbitrary Tailwind values, and they
        did not compile here — the container collapsed to zero width and the
        rows rendered as bare text with no image and no gap.
      */}
      <View style={{ width: THUMB_W, height: THUMB_H }} className="relative">
        <Thumbnail
          uri={incident.media.posterUrl}
          cacheKey={incident.id}
          poster={poster}
          category={incident.category}
          style={{ width: THUMB_W, height: THUMB_H, borderRadius: 6 }}
        />

        {/* A category rule along the base — hue without a chip taking width. */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: hue,
          }}
        />

        {isVideo || isAudio ? (
          <View
            style={{ position: 'absolute', bottom: 6, left: 6, width: 20, height: 20 }}
            className="items-center justify-center rounded-pill bg-black/60"
          >
            <Ionicons
              name={isAudio ? 'mic' : 'play'}
              size={11}
              color={c.textOnDark}
              style={isVideo ? { marginLeft: 1 } : undefined}
            />
          </View>
        ) : null}
      </View>

      {/* ── Headline and context ────────────────────────────────────────── */}
      <View className="flex-1 justify-between py-0.5">
        <Text
          variant="body"
          className="font-sans-medium"
          style={{ lineHeight: 21 }}
          numberOfLines={3}
        >
          {incident.description}
        </Text>

        <View className="mt-1.5 flex-row items-center gap-2">
          {/* Category leads. It is what a scanner is filtering for, and it is
              the only coloured thing on the line — putting the time first made
              six grey numbers the first thing the eye hit down the column. */}
          <Text
            variant="caption"
            className="font-sans-semibold uppercase"
            style={{ color: hue, letterSpacing: 0.4 }}
            numberOfLines={1}
          >
            {t(`category.${incident.category}`)}
          </Text>

          <View className="h-2.5 w-px bg-hairline/10" />

          <Text variant="caption" tone="faint">
            {formatRelativeTime(incident.publishedAt)}
          </Text>

          {/*
            Where it happened.

            The line carried category and time and nothing else, so the feed
            could not answer the first question a Ghanaian reader asks about an
            incident — is this near me. Both fields for it were already on the
            record and neither was rendered: `location.label` is the place name
            the server resolved, and `landmark` is the name people actually use
            when coordinates are not enough.

            Absent rather than a placeholder. A reporter who withheld their
            location did so for a reason, and "Location hidden" on the row
            advertises that there was something to hide — the same rule the
            console's provenance stamp follows.

            It takes the flexible width and truncates, so a long place name
            shortens itself instead of pushing the comment count off the row.
          */}
          {placeOf(incident) ? (
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
              <Ionicons name="location-outline" size={10} color={c.textFaint} />
              <Text variant="caption" tone="faint" numberOfLines={1} className="flex-1">
                {placeOf(incident)}
              </Text>
            </View>
          ) : (
            <View className="flex-1" />
          )}

          {incident.counts.comments > 0 ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name="chatbubble-outline" size={10} color={c.textFaint} />
              <Text variant="caption" tone="faint">
                {formatCount(incident.counts.comments)}
              </Text>
            </View>
          ) : null}
        </View>
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

  /*
   * Read off the record rather than declared on the type.
   *
   * The server sends `landmark` on an editorial item — confirmed against the
   * live service — but the public feed is a narrower projection and has not
   * been seen to carry it. Asserting the field on `Incident` would be claiming
   * a contract this client has not verified; reading it when present costs
   * nothing and adds a place name wherever one arrives.
   */
  const landmark = (incident as { landmark?: string | null }).landmark?.trim();
  return landmark || null;
}
