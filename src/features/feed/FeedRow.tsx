import { memo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { categoryColor, useColors } from '@/lib/theme';
import { formatCount, formatRelativeTime } from '@/lib/format';
import { Thumbnail } from '@/components/Thumbnail';
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
  const hue = categoryColor[incident.category];
  const isVideo = incident.media.kind === 'video';
  const isAudio = incident.media.kind === 'audio';

  return (
    <Pressable
      onPress={() => onOpen(incident)}
      accessibilityLabel={incident.description}
      className="flex-row gap-3 border-b border-hairline/[0.06] px-4 py-3.5"
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

        <View className="mt-1.5 flex-row items-center">
          <Text variant="caption" tone="faint">
            {formatRelativeTime(incident.publishedAt)}
          </Text>
          <Text variant="caption" tone="faint">
            {'  ·  '}
          </Text>
          <Text variant="caption" style={{ color: hue }} numberOfLines={1}>
            {t(`category.${incident.category}`)}
          </Text>

          {incident.counts.comments > 0 ? (
            <>
              <Text variant="caption" tone="faint">
                {'  ·  '}
              </Text>
              <Ionicons name="chatbubble-outline" size={10} color={c.textFaint} />
              <Text variant="caption" tone="faint">
                {' '}
                {formatCount(incident.counts.comments)}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
