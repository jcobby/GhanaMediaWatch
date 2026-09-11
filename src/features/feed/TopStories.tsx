import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/lib/theme';
import { FeedLead } from './FeedLead';
import { topStorySettings } from './topStorySettings';
import type { Incident } from '@/types/api';

/**
 * The top of the feed, as a rotation rather than a single story.
 *
 * A newsroom's front page has never had one lead. Several stories share the top
 * slot and take turns, because on a phone the width of one story is the width
 * of the screen — so the choice is between showing one and showing several over
 * time. The desk decides how many and how long each holds.
 *
 * **Everything about an auto-advancing carousel is a trap, and each one is a
 * rule in the tests.** They are among the most disliked patterns on the web,
 * and almost always for the same three reasons, all of which are fixable:
 *
 * 1. **It moves while you are reading it.** The timer here stops the moment a
 *    finger lands and does not restart until the reader has settled somewhere —
 *    so a carousel being read is a carousel standing still.
 * 2. **It cannot be controlled.** This one is swipeable, the dots say how many
 *    there are and which this is, and a swipe cancels the rotation rather than
 *    fighting it.
 * 3. **It moves for people who cannot tolerate motion.** With "reduce motion"
 *    on, it does not advance on its own at all. That is not a downgrade: the
 *    stories are all still reachable by swiping, which is how that reader would
 *    have got to them anyway.
 *
 * Two more that cost nothing. The timer stops when the screen is not in front
 * of anybody — a carousel ticking away under the profile tab is battery spent
 * on nothing. And a single story gets no timer and no dots, because then it is
 * simply the lead and the controls would be furniture for a rotation of one.
 */
export function TopStories({
  incidents,
  onOpen,
}: {
  incidents: Incident[];
  onOpen: (incident: Incident) => void;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { dwellMs } = topStorySettings();

  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  /** True while a finger is on it, or a swipe is still settling. */
  const [held, setHeld] = useState(false);
  const [focused, setFocused] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  const count = incidents.length;

  /*
   * "Reduce motion" is a system setting and can be changed while the app is
   * open, so it is subscribed to rather than read once at mount.
   */
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // Not while the reader is looking at another tab.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  /*
   * The rotation.
   *
   * Rebuilt whenever any of its conditions change, which is what makes the
   * pauses exact: a finger landing does not shorten the next story's turn, it
   * cancels the timer outright, and letting go starts a fresh full turn.
   */
  useEffect(() => {
    if (count < 2 || held || !focused || reduceMotion) return;

    const timer = setTimeout(() => {
      const next = (index + 1) % count;
      setIndex(next);
      scroller.current?.scrollTo({ x: next * width, animated: true });
    }, dwellMs);

    return () => clearTimeout(timer);
  }, [count, held, focused, reduceMotion, index, width, dwellMs]);

  /*
   * Where the reader actually left it.
   *
   * Taken from the scroll position rather than assumed from the timer, so a
   * swipe and an automatic advance cannot disagree about which story is showing
   * — which is how a carousel ends up jumping backwards under somebody's thumb.
   */
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const landed = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(count - 1, landed)));
    setHeld(false);
  };

  return (
    <View className="bg-canvas">
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // A swipe stops the rotation on contact, not when it finishes.
        onScrollBeginDrag={() => setHeld(true)}
        onMomentumScrollEnd={settle}
        // A drag that ends without momentum — a slow swipe — still settles.
        onScrollEndDrag={settle}
        scrollEventThrottle={16}
      >
        {incidents.map((incident) => (
          <View key={incident.id} style={{ width }}>
            <FeedLead incident={incident} onOpen={onOpen} />
          </View>
        ))}
      </ScrollView>

      {/*
        How many there are, and which this is.

        The single most common complaint about a rotation is not knowing that
        anything is rotating, or how much of it has been missed. Two dots is
        already worth drawing; one is not a rotation at all.
      */}
      {count > 1 ? (
        <View className="flex-row items-center justify-center gap-1.5 pb-3">
          {incidents.map((incident, position) => (
            <View
              key={incident.id}
              style={{
                width: position === index ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: position === index ? c.accent : c.hairline,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
