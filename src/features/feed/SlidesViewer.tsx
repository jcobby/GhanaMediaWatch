import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable as RNPressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { Thumbnail } from '@/components/Thumbnail';
import { CaptureStamp } from '@/components/CaptureStamp';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { categoryColor, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import type { Incident } from '@/types/api';

/**
 * The feed as slides, one report at a time.
 *
 * The list suits someone hunting for a particular thing. This suits the other
 * reader — the one catching up, who wants the day handed to them rather than
 * scrolled through. It is the format people already know from WhatsApp Status,
 * so nothing has to be taught.
 *
 * What it is *not* is a different feed. It plays whatever the list is currently
 * showing, filter included, so switching modes never changes the set of
 * reports — only how they arrive.
 */

/** Long enough to read three lines and look at the picture, not long enough to stall. */
const SLIDE_MS = 6000;

export function SlidesViewer({
  incidents,
  startAt = 0,
  onClose,
  onOpen,
}: {
  incidents: Incident[];
  startAt?: number;
  onClose: () => void;
  onOpen: (incident: Incident) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width } = Dimensions.get('window');

  const [index, setIndex] = useState(startAt);
  const [paused, setPaused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const incident = incidents[index];

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= incidents.length) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [incidents.length, onClose]);

  const previous = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /*
   * The bar drives the advance, rather than a timer advancing and the bar
   * animating alongside it. Two clocks would drift, and the visible one would
   * be the liar.
   *
   * Reduced motion stops the auto-advance entirely rather than merely removing
   * the animation. Content that moves on without you is the accessibility
   * problem here, not the sliding bar.
   */
  useEffect(() => {
    progress.setValue(0);
    if (paused || reducedMotion || !incident) return;

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) next();
    });

    return () => animation.stop();
  }, [index, paused, reducedMotion, incident, next, progress]);

  if (!incident) return null;

  const hue = categoryColor[incident.category];

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      // Android's back button must close the viewer rather than the app.
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        <Thumbnail
          uri={incident.media.posterUrl}
          category={incident.category}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        />

        {/* Legible text over any photograph needs its own ground. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.42, 1]}
          style={{ position: 'absolute', inset: 0 }}
          pointerEvents="none"
        />

        {/* ── Tap zones ─────────────────────────────────────────────────── */}
        {/* Behind the chrome, so the close button still wins a tap. */}
        <View className="absolute inset-0 flex-row">
          <RNPressable
            onPress={previous}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={180}
            accessibilityLabel={t('slides.previous')}
            style={{ width: width * 0.32, height: '100%' }}
          />
          <RNPressable
            onPress={next}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={180}
            accessibilityLabel={t('slides.next')}
            style={{ flex: 1, height: '100%' }}
          />
        </View>

        {/* ── Progress ──────────────────────────────────────────────────── */}
        <View
          className="absolute left-0 right-0 flex-row gap-1 px-3"
          style={{ top: insets.top + 8 }}
          pointerEvents="none"
        >
          {incidents.map((item, i) => (
            <View
              key={item.id}
              style={{ height: 3 }}
              className="flex-1 overflow-hidden rounded-pill bg-white/25"
            >
              <Animated.View
                style={{
                  height: '100%',
                  backgroundColor: '#FFFFFF',
                  width:
                    i < index
                      ? '100%'
                      : i === index
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          })
                        : '0%',
                }}
              />
            </View>
          ))}
        </View>

        {/* ── Close ─────────────────────────────────────────────────────── */}
        <RNPressable
          onPress={onClose}
          accessibilityLabel={t('common.close')}
          hitSlop={12}
          className="absolute h-10 w-10 items-center justify-center rounded-pill bg-black/40"
          style={{ top: insets.top + 22, right: 12 }}
        >
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </RNPressable>

        {paused ? (
          <View
            className="absolute self-center rounded-pill bg-black/55 px-3 py-1"
            style={{ top: insets.top + 26 }}
            pointerEvents="none"
          >
            <Text variant="caption" onMedia>
              {t('slides.paused')}
            </Text>
          </View>
        ) : null}

        {/* ── The report ────────────────────────────────────────────────── */}
        <View
          className="absolute left-0 right-0 gap-3 px-5"
          style={{ bottom: insets.bottom + 24 }}
          pointerEvents="box-none"
        >
          <View className="flex-row items-center gap-2">
            <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: `${hue}E6` }}>
              <Text variant="caption" onMedia className="font-sans-semibold uppercase">
                {t(`category.${incident.category}`)}
              </Text>
            </View>
            <Text variant="caption" onMedia tone="muted">
              {formatRelativeTime(incident.publishedAt)}
            </Text>
          </View>

          <Text variant="title-md" onMedia numberOfLines={4} className="font-sans-semibold">
            {incident.description}
          </Text>

          {/* Provenance travels with the report here as everywhere else. */}
          <CaptureStamp incident={incident} compact />

          <RNPressable
            onPress={() => onOpen(incident)}
            accessibilityLabel={t('slides.openReport')}
            className="mt-1 flex-row items-center justify-center gap-2 rounded-lg bg-white/95 py-3"
          >
            <Text variant="body-sm" className="font-sans-semibold">
              {t('slides.openReport')}
            </Text>
            <Ionicons name="arrow-forward" size={15} color={c.textPrimary} />
          </RNPressable>
        </View>

        {/* Reduced motion removes the clock, so advancing becomes explicit. */}
        {reducedMotion ? (
          <View
            className="absolute self-center rounded-pill bg-black/55 px-3 py-1"
            style={{ bottom: insets.bottom + 4 }}
            pointerEvents="none"
          >
            <Text variant="caption" onMedia tone="muted">
              {t('slides.tapToAdvance')}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
