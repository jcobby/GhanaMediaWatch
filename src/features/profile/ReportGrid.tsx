import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { Thumbnail } from '@/components/Thumbnail';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import { categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import type { AuthoredIncident } from '@/types/api';

/**
 * The reporter's own reports, laid out like the phone's gallery.
 *
 * A grid rather than a stack of cards, because that is the shape people already
 * know for "things I recorded": three across, square, scanned by eye rather
 * than read. The card list showed four reports per screen and made finding one
 * filmed last week a scroll; this shows twelve.
 *
 * **The tick is the point of the grid.** The first question about a report is
 * not what it was — the thumbnail answers that — it is whether it got anywhere.
 * So every tile carries one mark, in the corner, and it means one thing:
 *
 *   ✓ blue      it reached an audience — published to the feed
 *   ⏱ amber     with the newsroom, nobody has decided yet
 *   ✕ red       decided against, or restricted
 *
 * Three, not four. There is deliberately no "still on this phone" mark here:
 * everything on this screen comes from `/me/incidents`, so the server already
 * has all of it. Work that has *not* left the device has no server record to
 * appear in this list at all — it lives in the Outbox, which is a different
 * screen because it needs different controls (retry, cancel, wait for Wi-Fi).
 * A tile that claimed to cover both would be quietly missing exactly the
 * reports a reporter most needs to find.
 *
 * Every tile opens the full record. The grid deliberately shows less than the
 * cards did — a mark and a duration is the whole tile — so nothing is lost by
 * tapping, and the detail is one tap away rather than crowding the scan.
 */

export type DeliveryMark = 'delivered' | 'waiting' | 'declined';

/**
 * What became of one report.
 *
 * Read from `vettingState`, which is already on the record, rather than from
 * the outcome timeline: that is one request per report, and a grid of twelve
 * tiles would fire twelve of them to draw twelve small icons.
 */
export function deliveryMark(report: AuthoredIncident): DeliveryMark {
  switch (report.vettingState) {
    case 'published':
      return 'delivered';
    case 'rejected':
    case 'restricted':
      return 'declined';
    default:
      return 'waiting';
  }
}

const MARK_ICON: Record<DeliveryMark, keyof typeof Ionicons.glyphMap> = {
  delivered: 'checkmark-circle',
  waiting: 'time',
  declined: 'close-circle',
};

export function ReportGrid({
  reports,
  onOpen,
}: {
  reports: AuthoredIncident[];
  onOpen: (report: AuthoredIncident) => void;
}) {
  return (
    <View className="flex-row flex-wrap">
      {reports.map((report) => (
        <ReportTile key={report.id} report={report} onOpen={() => onOpen(report)} />
      ))}
    </View>
  );
}

function ReportTile({ report, onOpen }: { report: AuthoredIncident; onOpen: () => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const mark = deliveryMark(report);

  /*
   * A frame from the clip. Most of a reporter's own grid is footage, and
   * without this every video tile is the same drawing of its category — twelve
   * tiles that all look alike, for twelve different things they filmed.
   */
  const poster = useVideoPoster({
    id: report.id,
    kind: report.media.kind,
    url: report.media.url,
    posterUrl: report.media.posterUrl,
  });

  const markColour: Record<DeliveryMark, string> = {
    delivered: c.info,
    waiting: c.warning,
    declined: c.danger,
  };

  return (
    <Pressable
      onPress={onOpen}
      haptic={false}
      accessibilityLabel={`${t(`category.${report.category}`)} — ${t(`profile.mark.${mark}`)}`}
      /*
       * A third of the row, square, with a hairline gap. Percentage width
       * rather than a measured one so it holds on every screen size without a
       * layout pass, and `aspect-square` keeps the grid on a line even when a
       * thumbnail fails to load and contributes no height of its own.
       */
      className="aspect-square w-1/3 p-px"
    >
      <View className="flex-1 overflow-hidden bg-canvas-raise">
        {/*
          `Thumbnail`, not a bare `Image`, and the difference was expensive.

          This tile used to fall back to `media.url` when there was no poster —
          which for a video is the video. Twelve tiles therefore pulled twelve
          whole clips down a mobile connection so that `expo-image` could fail
          to decode each one and leave the tile grey: the reporter paid for
          every megabyte of their own footage to be shown nothing.

          `Thumbnail` draws the category scene instead, takes a frame from the
          clip where it can, and keys its cache on the report id so the grid is
          fetched once rather than on every visit.
        */}
        <Thumbnail
          uri={report.media.posterUrl}
          poster={poster}
          cacheKey={report.id}
          category={report.category}
          style={{ width: '100%', height: '100%' }}
          glyphSize={28}
        />

        {/*
          A category stripe down the left edge.

          Two pixels, because the thumbnail is the content and a coloured chip
          over it would cover the thing being identified. It is the same colour
          the feed and the console use for that category.
        */}
        {/*
          Width goes through `style`, not `w-[2px]`.

          Arbitrary pixel classes do not compile in this NativeWind setup — they
          resolve to nothing and the element collapses, so the stripe would be
          invisible with no error to say why. The same trap the feed row's
          thumbnail hit, and the project has a test for it.
        */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 2,
            backgroundColor: categoryHue(report.category),
          }}
        />

        {/*
          The mark, over a scrim.

          On the footage rather than beside it: a tick in a caption below the
          grid would be read as belonging to the row, not the tile. The scrim is
          what keeps it legible over a bright frame — a white tick on a white
          sky is not a status.
        */}
        <View className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-pill bg-black/45">
          <Ionicons name={MARK_ICON[mark]} size={13} color={markColour[mark]} />
        </View>

        {report.media.kind === 'video' ? (
          <View className="absolute bottom-1 left-1.5 flex-row items-center gap-1">
            <Ionicons name="videocam" size={11} color="rgba(255,255,255,0.9)" />
            {report.media.durationMs ? (
              <Text variant="caption" onMedia className="font-sans-semibold">
                {formatDuration(report.media.durationMs)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Filed, not published: `publishedAt` is null until an editor runs it,
            so an in-review tile carried no timestamp at all. */}
        <View className="absolute bottom-1 right-1.5">
          <Text variant="caption" onMedia>
            {formatRelativeTime(report.createdAt) ?? ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** m:ss, the form every gallery uses for a clip. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
