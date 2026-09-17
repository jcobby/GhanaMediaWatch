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
import { FeedLead } from './FeedLead';
import { LEAD_IMAGE_RATIO } from './leadLayout';
import { useTopStorySettings, VIDEO_PREVIEW_MS, VIDEO_START_TIMEOUT_MS } from './topStorySettings';
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
 *
 * **Footage plays, and that is a decision with a price on it.** A video lead
 * runs muted for a few seconds and then the rotation moves on. It is the
 * strongest thing a news app can put at the top of a feed and it spends a
 * reader's data bundle to do it, so it is confined as tightly as it can be:
 * one slide at a time, never off-screen, never under "reduce motion", and never
 * with sound. The rest of the feed still autoplays nothing at all.
 */
export function TopStories({
  incidents,
  onOpen,
}: {
  incidents: Incident[];
  onOpen: (incident: Incident) => void;
}) {
  const { width } = useWindowDimensions();
  // The desk's own number from `GET /settings`, once it arrives.
  const { dwellMs } = useTopStorySettings();

  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  /** True while a finger is on it, or a swipe is still settling. */
  const [held, setHeld] = useState(false);
  const [focused, setFocused] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  /** The slide whose footage has actually started moving, if any has. */
  const [startedId, setStartedId] = useState<string | null>(null);

  const count = incidents.length;

  /*
   * How long this slide holds.
   *
   * A video plays for its preview and then moves on, so the rotation never sits
   * on a clip that has stopped — the deadest thing a moving lead can do. A still
   * holds for the time the desk set, which is about reading a headline.
   *
   * Footage does not move while "reduce motion" is on. A carousel that has
   * stopped advancing but is still playing video underneath would honour the
   * letter of that setting and none of its point.
   */
  const showing = incidents[index];
  const motion = !reduceMotion && focused;
  const isVideoSlide = motion && showing?.media.kind === 'video';

  /*
   * How long this slide holds, and from when.
   *
   * A photograph holds for the desk's dwell. A video holds for five seconds
   * **of footage**: until its clip reports that it is moving, the slide waits,
   * and the preview is timed from that moment — so a clip that takes three
   * seconds to buffer still gets its full five. If it never starts (a dead link,
   * a codec the phone cannot play), the wait is capped and the rotation moves on
   * rather than stalling on a still frame.
   */
  const started = isVideoSlide && startedId === showing?.id;
  const dwell = !isVideoSlide ? dwellMs : started ? VIDEO_PREVIEW_MS : VIDEO_START_TIMEOUT_MS;

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
      // The next slide has not started yet, whatever it did last time round.
      setStartedId(null);
      setIndex(next);
      scroller.current?.scrollTo({ x: next * width, animated: true });
    }, dwell);

    return () => clearTimeout(timer);
  }, [count, held, focused, reduceMotion, index, width, dwell, started]);

  /*
   * Where the reader actually left it.
   *
   * Taken from the scroll position rather than assumed from the timer, so a
   * swipe and an automatic advance cannot disagree about which story is showing
   * — which is how a carousel ends up jumping backwards under somebody's thumb.
   */
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const landed = Math.max(
      0,
      Math.min(count - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
    );
    if (landed !== index) setStartedId(null);
    setIndex(landed);
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
        {incidents.map((incident, position) => (
          <View key={incident.id} style={{ width }}>
            {/*
              Only the slide on screen plays, and only while the reader is on
              this screen and has not asked for less motion. Five clips loading
              at once would cost several megabytes for four stories nobody saw.
            */}
            <FeedLead
              incident={incident}
              onOpen={onOpen}
              playing={motion && position === index}
              // The next slide buffers while this one plays, so it is ready the
              // moment it arrives instead of starting from nothing.
              preload={motion && count > 1 && position === (index + 1) % count}
              onPlaybackStarted={() => {
                if (position === index) setStartedId(incident.id);
              }}
            />
          </View>
        ))}
      </ScrollView>

      {/*
        How many there are, and which this is — drawn on the picture.

        The single most common complaint about a rotation is not knowing that
        anything is rotating. They sit over the bottom of the image rather than
        in a strip below it, so the headline follows the picture directly the
        way a newspaper lead does, with nothing wedged between them.
      */}
      {count > 1 ? (
        <View
          pointerEvents="none"
          className="flex-row items-center gap-1.5 rounded-pill bg-black/40 px-2 py-1"
          style={{ position: 'absolute', right: 12, top: Math.round(width * LEAD_IMAGE_RATIO) - 26 }}
        >
          {incidents.map((incident, position) => (
            <View
              key={incident.id}
              style={{
                width: position === index ? 14 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: position === index ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
