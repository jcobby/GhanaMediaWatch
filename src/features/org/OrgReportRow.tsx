import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Pressable, Text } from '@/components/ui';
import { Thumbnail } from '@/components/Thumbnail';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import { categoryHue, useColors } from '@/lib/theme';
import { formatDistance, formatRelativeTime } from '@/lib/format';
import type { OrgInboxItem } from '@/types/org';

/**
 * One routed report, as a row an officer scans.
 *
 * A row rather than the reporter's gallery grid, and the difference is what the
 * two people are doing. A reporter is looking for footage they remember filming
 * and recognises it by sight, so a grid of stills is right. An officer has
 * never seen any of this: they are triaging, and the questions are what is it,
 * where, how long ago, and have we already paid for it. Those are words, so the
 * still is a small mark beside them rather than the row itself.
 *
 * The licence state is a badge rather than a colour, because "we already hold
 * this one" is the fact that decides whether the next tap spends money.
 */
export function OrgReportRow({
  report,
  onOpen,
}: {
  report: OrgInboxItem;
  onOpen: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation();

  // The service's 320px copy where it has one; the poster is a full-size file
  // and this is a 56px square.
  const still = report.media.thumbUrl || report.media.posterUrl;
  const poster = useVideoPoster({
    id: report.id,
    kind: report.media.kind,
    url: report.media.url,
    posterUrl: still,
  });

  const place = report.location.label;
  const when = formatRelativeTime(report.licensedAt ?? report.publishedAt);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={`${t(`category.${report.category}`)} — ${report.description}`}
      className="flex-row items-center gap-3 rounded-lg bg-glass/[0.08] p-3"
    >
      {/*
        The still's size goes through `style`, not `h-14 w-14`.

        NativeWind compiles this project's stylesheet when Metro boots, from the
        class names it finds in `src`. A class no file used before — `w-14` was
        one — is simply absent until Metro is restarted, and an absent class has
        no symptom: the view gets no width, the row collapses, and every check
        still passes. The rest of this app sizes media through `style` for
        exactly that reason, and this now does too.
      */}
      <View
        style={{ width: 56, height: 56 }}
        className="overflow-hidden rounded-sm bg-canvas-raise"
      >
        <Thumbnail
          uri={still}
          poster={poster}
          cacheKey={report.id}
          category={report.category}
          style={{ width: '100%', height: '100%' }}
          glyphSize={20}
        />
        {/* Arbitrary pixel widths do not compile in this NativeWind setup, so
            the category stripe is an inline style like the grid tile's. */}
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
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text variant="body-sm" tone="muted" className="font-sans-semibold uppercase">
            {t(`category.${report.category}`)}
          </Text>
          {report.media.kind === 'video' ? (
            <Ionicons name="videocam" size={12} color={c.textFaint} />
          ) : null}
        </View>
        <Text variant="body" numberOfLines={2}>
          {report.description}
        </Text>
        <View className="flex-row items-center gap-2">
          {place ? (
            <Text variant="caption" tone="muted" numberOfLines={1} className="max-w-[45%]">
              {place}
            </Text>
          ) : null}
          {report.distanceM !== undefined ? (
            <Text variant="caption" tone="faint">
              {formatDistance(report.distanceM)}
            </Text>
          ) : null}
          {when ? (
            <Text variant="caption" tone="faint">
              {when}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="items-end gap-1.5">
        {report.licensed ? (
          <Badge label={t('org.licensed')} tone="success" />
        ) : (
          <Badge label={t('org.new')} tone="accent" />
        )}
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </View>
    </Pressable>
  );
}
