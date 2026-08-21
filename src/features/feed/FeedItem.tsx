import { memo } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_CONTENT_HEIGHT } from '@/components/RoleTabBar';
import { useTranslation } from 'react-i18next';
import { Glass, Pressable, Text } from '@/components/ui';
import { FeedVideo } from './FeedVideo';
import { categoryColor, colors } from '@/lib/theme';
import { formatCount, formatDistance, formatExactCapture, formatRelativeTime } from '@/lib/format';
import type { Incident } from '@/types/api';

interface FeedItemProps {
  incident: Incident;
  height: number;
  /** Only the in-view item plays; everything else is paused. */
  isActive: boolean;
  onNavigate: (incident: Incident) => void;
  onOpenDetail: (incident: Incident) => void;
  muted: boolean;
  onToggleMute: () => void;
}

/** Vertical space the caption block and rail must clear above the tab bar. */
// Sits above the tab bar with room to breathe; derived so it cannot drift
// away from the bar's actual height.
const TAB_BAR_CLEARANCE = TAB_CONTENT_HEIGHT + 18;

interface RailButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  active?: boolean;
  onPress: () => void;
}

/**
 * One action in the right-hand rail.
 *
 * Icons sit bare on the media under a drop shadow rather than inside filled
 * circles — five stacked circles read as a control panel bolted onto the photo,
 * which is exactly the heaviness this design avoids.
 */
function RailButton({ icon, label, value, active, onPress }: RailButtonProps) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} className="items-center gap-1">
      <View
        className="h-11 w-11 items-center justify-center"
        // Keeps a white glyph readable on a bright frame without the visual
        // weight of a filled backing.
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name={icon} size={29} color={active ? colors.live : colors.textOnDark} />
      </View>
      {value ? (
        <Text variant="caption" onMedia className="font-sans-semibold">
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A single full-screen feed cell.
 *
 * Memoised because the pager keeps several mounted at once, and re-rendering an
 * off-screen cell on every scroll frame is the fastest way to lose 60fps.
 */
export const FeedItem = memo(function FeedItem({
  incident,
  height,
  isActive,
  onNavigate,
  onOpenDetail,
  muted,
  onToggleMute,
}: FeedItemProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const hue = categoryColor[incident.category];

  /*
   * Display-flag enforcement, client side.
   *
   * The server already nulls suppressed fields, but the client refuses to
   * render them independently — one layer failing must not expose a reporter's
   * location. Absence of the value is the only signal used; there is no
   * separate "hidden" flag to drift out of sync with the data.
   */
  const placeLabel = incident.location.label;
  const hasDistance = typeof incident.distanceM === 'number';
  const timeLabel = incident.capturedAtIso ? formatRelativeTime(incident.capturedAtIso) : null;
  // Relative time answers "is this happening now?"; the exact stamp answers
  // "when exactly?" — a report used to dispatch a patrol needs both.
  const exactLabel = formatExactCapture(incident.capturedAtIso, incident.capturedAtPrecision);
  const canNavigate = incident.location.latitude !== null && incident.location.longitude !== null;
  const isVideo = incident.media.kind === 'video';

  // Narrow on the discriminant itself — a derived boolean does not narrow the
  // union, so `publisher.displayName` would not typecheck through it.
  const isAnonymous = incident.publisher.kind === 'anonymous';
  const publisherName =
    incident.publisher.kind === 'anonymous'
      ? t('common.anonymous')
      : incident.publisher.displayName;

  return (
    <View style={{ height }} className="w-full bg-canvas">
      {isVideo ? (
        <FeedVideo
          uri={incident.media.url}
          posterUri={incident.media.posterUrl}
          isActive={isActive}
          muted={muted}
        />
      ) : (
        <Image
          source={{ uri: incident.media.url }}
          placeholder={{ blurhash: 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4' }}
          contentFit="cover"
          transition={220}
          style={{ position: 'absolute', inset: 0 }}
          accessibilityLabel={incident.description}
        />
      )}

      {/*
       * Scrims. Three stops rather than two, reaching only ~42% up the frame:
       * a single 0→0.88 ramp over half the screen washed the photograph out.
       * This stays near-transparent through its first third, so it darkens only
       * where text actually sits.
       */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 150 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.42 }}
        pointerEvents="none"
      />

      {/* Mute toggle — video only, and persistent across cells so the choice
          survives scrolling rather than resetting on every swipe. */}
      {isVideo ? (
        <Pressable
          onPress={onToggleMute}
          haptic={false}
          accessibilityLabel={muted ? t('feed.unmute') : t('feed.mute')}
          className="absolute right-4"
          style={{ top: insets.top + 8 }}
        >
          <Glass
            context="media"
            elevation="low"
            className="h-9 w-9 items-center justify-center rounded-pill"
          >
            <Ionicons
              name={muted ? 'volume-mute' : 'volume-high'}
              size={16}
              color={colors.textOnDark}
            />
          </Glass>
        </Pressable>
      ) : null}

      {/* Action rail */}
      <View
        className="absolute right-2.5 items-center gap-4"
        style={{ bottom: insets.bottom + TAB_BAR_CLEARANCE + 96 }}
      >
        <RailButton
          icon={incident.viewerHasReacted ? 'heart' : 'heart-outline'}
          label={t('feed.react')}
          value={formatCount(incident.counts.reactions)}
          active={incident.viewerHasReacted}
          onPress={() => undefined}
        />
        <RailButton
          icon="chatbubble-outline"
          label={t('feed.comments')}
          value={formatCount(incident.counts.comments)}
          onPress={() => onOpenDetail(incident)}
        />
        <RailButton icon="arrow-redo-outline" label={t('feed.share')} onPress={() => undefined} />
        <RailButton icon="bookmark-outline" label={t('feed.save')} onPress={() => undefined} />
        <RailButton
          icon="ellipsis-horizontal"
          label={t('feed.reportAbuse')}
          onPress={() => undefined}
        />
      </View>

      {/* Caption block — all incident metadata lives here, in one column, so
          nothing floats where the app header sits. */}
      <View
        className="absolute left-4 right-16 gap-2.5"
        style={{ bottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        {/* Category · time · confidence, on one line above the headline */}
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5">
          <View
            className="flex-row items-center gap-1.5 rounded-pill px-2.5 py-1"
            style={{ backgroundColor: `${hue}E6` }}
          >
            <Text variant="caption" className="font-sans-semibold uppercase text-white">
              {t(`category.${incident.category}`)}
            </Text>
          </View>
          {timeLabel ? (
            <Text variant="caption" onMedia className="font-sans-semibold">
              {timeLabel}
            </Text>
          ) : null}
          {exactLabel ? (
            <>
              <View className="h-0.5 w-0.5 rounded-pill bg-white/50" />
              <Text variant="caption" tone="muted" onMedia>
                {exactLabel}
              </Text>
            </>
          ) : null}
          {incident.location.confidence === 'low' ? (
            <View className="rounded-pill bg-warning px-2 py-0.5">
              <Text variant="caption" className="font-sans-semibold text-white">
                {t('capture.lowGps')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* The headline of the cell */}
        <Text variant="body-lg" onMedia numberOfLines={3} className="font-sans-medium">
          {incident.description}
        </Text>

        {/* Reporter and place on one quiet line */}
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => onOpenDetail(incident)}
            haptic={false}
            accessibilityLabel={publisherName}
            className="flex-row items-center gap-1.5"
          >
            <View
              className={
                isAnonymous
                  ? 'h-6 w-6 items-center justify-center rounded-pill bg-glass-media/70'
                  : 'h-6 w-6 items-center justify-center rounded-pill bg-accent'
              }
            >
              <Ionicons
                name={isAnonymous ? 'eye-off' : 'person'}
                size={11}
                color={colors.textOnDark}
              />
            </View>
            <Text variant="body-sm" onMedia className="font-sans-semibold">
              {publisherName}
            </Text>
          </Pressable>
          {placeLabel || hasDistance ? (
            <>
              <View className="h-0.5 w-0.5 rounded-pill bg-white/50" />
              <Text variant="body-sm" tone="muted" onMedia numberOfLines={1} className="flex-1">
                {[placeLabel, hasDistance ? formatDistance(incident.distanceM!) : null]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            </>
          ) : null}
        </View>

        {/* Navigation is offered only when a real coordinate survived the
            display flags — otherwise there is nowhere to route to. */}
        {canNavigate ? (
          <Pressable
            onPress={() => onNavigate(incident)}
            accessibilityLabel={t('feed.navigateHere')}
            className="mt-0.5 self-start"
          >
            <Glass
              context="media"
              elevation="high"
              className="flex-row items-center gap-2 rounded-pill py-2.5 pl-3.5 pr-4"
            >
              <Ionicons name="navigate" size={15} color={colors.textOnDark} />
              <Text variant="body-sm" className="font-sans-semibold" onMedia>
                {t('feed.navigateHere')}
              </Text>
            </Glass>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
