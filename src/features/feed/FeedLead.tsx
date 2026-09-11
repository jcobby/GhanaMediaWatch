import { memo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { Thumbnail } from '@/components/Thumbnail';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import type { Incident } from '@/types/api';

/**
 * The lead story, given the room a lead deserves.
 *
 * The feed was forty identical rows. Every report had the same 112×86 thumbnail
 * and the same three lines, so the most important thing on the desk looked
 * exactly like the fortieth — and a reader opening the app had nothing to land
 * on. Every newspaper and every news app solves this the same way, because it
 * works: one story gets the width of the page, and the rest queue beneath it.
 *
 * **Why the first item, and not a score.** The server orders the feed, and for
 * a desk that means the top of it is the lead — the same judgement an editor
 * already made when they published it to a section. Picking a different one
 * here would be this client second-guessing the newsroom with a number the
 * phone computed on its own.
 *
 * It is *not* shown over a search. A result list has a first row, not a lead,
 * and putting "Top story" over whatever happened to match is the interface
 * asserting an editorial judgement nobody made.
 */
/**
 * Exact offsets and sizes go through `style`, never a utility class.
 *
 * `bottom-4` appeared nowhere else in this app, and NativeWind compiles
 * `global.css` when Metro boots — so a class it has never seen is not in the
 * compiled sheet and the rule is dropped in silence. A React Native view with
 * `position: absolute` and no `bottom` falls back to its static position, which
 * put the play badge at the *top* of the lead, sitting on the eyebrow.
 *
 * No error, no warning, and it survives a reload. The same trap the feed row
 * hit when `w-[112px]` collapsed its thumbnail to nothing, and the reason the
 * 16:9 height below is arithmetic rather than `aspect-[16/9]`.
 */
const OVERLAY_TOP_LEFT = { position: 'absolute', top: 16, left: 16 } as const;
const OVERLAY_BOTTOM_LEFT = { position: 'absolute', bottom: 16, left: 16 } as const;

export const FeedLead = memo(function FeedLead({
  incident,
  onOpen,
}: {
  incident: Incident;
  onOpen: (incident: Incident) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const hue = categoryHue(incident.category);

  const isVideo = incident.media.kind === 'video';
  const isAudio = incident.media.kind === 'audio';

  /*
   * 16:9, measured rather than an aspect class. See `OVERLAY_TOP_LEFT`.
   */
  const imageHeight = Math.round((width * 9) / 16);

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
      haptic={false}
      className="bg-canvas"
    >
      <View style={{ width, height: imageHeight }} className="relative">
        <Thumbnail
          uri={incident.media.posterUrl}
          cacheKey={incident.id}
          /*
            A frame the phone cut from the clip, because the service sends none.
            Without it a flood report leads with a drawing of a raindrop instead
            of the thing somebody filmed. See `lib/videoPoster`.
          */
          poster={poster}
          category={incident.category}
          style={{ width, height: imageHeight }}
          glyphSize={44}
        />

        {/*
          The eyebrow sits on the picture rather than above it.

          Over the image it reads as a stamp on the story; above it, it reads as
          a section heading for everything that follows — which is what it would
          be claiming about the forty rows underneath.
        */}
        <View
          style={OVERLAY_TOP_LEFT}
          className="flex-row items-center gap-1.5 rounded-pill bg-black/55 px-2.5 py-1"
        >
          <View style={{ backgroundColor: hue }} className="h-1.5 w-1.5 rounded-pill" />
          <Text variant="caption" onMedia className="font-sans-semibold uppercase">
            {t('feed.topStory')}
          </Text>
        </View>

        {/* Footage announces itself. A still and a clip are different things to
            open, and the reader decides before tapping rather than after. */}
        {isVideo || isAudio ? (
          <View
            style={OVERLAY_BOTTOM_LEFT}
            className="h-11 w-11 items-center justify-center rounded-pill bg-black/55"
          >
            <Ionicons
              name={isAudio ? 'mic' : 'play'}
              size={20}
              color={c.textOnDark}
              style={isVideo ? { marginLeft: 2 } : undefined}
            />
          </View>
        ) : null}
      </View>

      <View className="gap-2 px-4 pb-4 pt-3.5">
        <Text
          variant="title-md"
          className="font-sans-semibold"
          style={{ lineHeight: 27 }}
          numberOfLines={4}
        >
          {incident.description}
        </Text>

        <View className="flex-row items-center gap-2">
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
            Where it happened, when the service resolved a name for it.

            Absent rather than placeheld: a reporter who withheld their location
            did so for a reason, and "Location hidden" on the lead advertises
            that there was something to hide — the same rule the row follows.
          */}
          {incident.location.label ? (
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
              <Ionicons name="location-outline" size={11} color={c.textFaint} />
              <Text variant="caption" tone="faint" numberOfLines={1} className="flex-1">
                {incident.location.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
