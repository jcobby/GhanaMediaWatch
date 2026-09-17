import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';

/**
 * Which moment of a clip stands for it in a list.
 *
 * Without this the app takes a frame a second in and the reporter has no say.
 * That is a reasonable guess and often a poor picture: the operator is still
 * raising the phone, or the thing being reported has not come into shot yet.
 * The person who filmed it knows which second shows what they are reporting,
 * and this is the only screen where they are still holding the file.
 *
 * **It costs nothing.** The recording is on the phone — these frames are cut
 * from local storage with no network at all, which is why the strip can offer
 * several and why it can afford to be here rather than behind a tap.
 *
 * **What it does not yet do.** The choice is kept and used everywhere in this
 * app — the reporter's own grid, and the feed once the report is published —
 * but it does not reach anybody else. The service has no field for a poster, so
 * an editor at the desk and a reader on another phone still see the frame their
 * own client cut, or the category artwork. Item 6 in BACKEND-REQUESTS asks for
 * the field; until it lands this is honest about being one person's view.
 */

/** Four is enough to find a usable frame and short enough to scan in one look. */
const CANDIDATE_COUNT = 4;

const STRIP_W = 84;
const STRIP_H = 64;

export function PosterPicker({
  uri,
  durationMs,
  value,
  onChange,
}: {
  uri: string;
  /** What the recorder measured. Null on a clip whose length was never taken. */
  durationMs: number | null;
  value: number | null;
  onChange: (atMs: number | null) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();

  const offsets = candidateOffsets(durationMs);

  /*
   * A player over the local file, purely to seek it.
   *
   * Never rendered and never played. `generateThumbnailsAsync` needs a player,
   * and `useVideoPlayer` cleans this one up when the screen goes away — which
   * matters here, because a reporter can reach this screen and leave it several
   * times before deciding to send.
   */
  const player = useVideoPlayer(uri, (instance) => {
    // Seeking for stills, not playing: never claim the phone's audio.
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
  });
  const [frames, setFrames] = useState<VideoThumbnail[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const taken = await player.generateThumbnailsAsync(
          offsets.map((ms) => ms / 1000),
          { maxWidth: 240 },
        );
        if (!cancelled) setFrames(taken);
      } catch {
        /*
         * A codec the device cannot decode, or a clip too short for the
         * offsets. The strip disappears rather than showing four grey boxes,
         * and the automatic frame is used — which is what would have happened
         * anyway before this existed.
         */
        if (!cancelled) setFrames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `offsets` is derived from `durationMs` and rebuilt each render; depending
    // on it directly would re-seek the file on every keystroke elsewhere.
  }, [player, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing to choose between: the clip could not be read, or has no frames.
  if (frames !== null && frames.length === 0) return null;

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {t('review.posterLabel')}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {offsets.map((ms, index) => {
          const frame = frames?.[index];
          const chosen = value === null ? index === 0 : value === ms;

          return (
            <Pressable
              key={ms}
              // Tapping the first one is choosing it, not clearing the choice —
              // `null` and "the first frame" happen to look the same and must
              // not behave differently once somebody has decided.
              onPress={() => onChange(ms)}
              accessibilityLabel={t('review.posterFrame', { seconds: Math.round(ms / 1000) })}
              accessibilityState={{ selected: chosen }}
              haptic={false}
              /*
                Exact sizes through `style`. Arbitrary Tailwind values do not
                compile in this NativeWind setup — the feed row learned it when
                `w-[112px]` collapsed its thumbnail to nothing.
              */
              style={{
                width: STRIP_W,
                height: STRIP_H,
                borderWidth: 2,
                borderColor: chosen ? c.accent : 'transparent',
                borderRadius: 8,
              }}
              className="overflow-hidden bg-canvas-raise"
            >
              {frame ? (
                <Image
                  source={frame}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={120}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Text variant="caption" tone="faint">
        {t('review.posterHelp')}
      </Text>
    </View>
  );
}

/**
 * The moments to offer, in milliseconds.
 *
 * Spread across the clip rather than bunched at the start, and never at zero or
 * at the very end: the first frame is usually the phone still being raised and
 * the last is usually it being lowered. A clip whose length was never measured
 * falls back to fixed early offsets, which is the best guess available without
 * knowing how long it runs.
 */
function candidateOffsets(durationMs: number | null): number[] {
  if (!durationMs || durationMs < 2000) return [1000, 2000, 3000, 4000];

  const span = durationMs * 0.8;
  const start = durationMs * 0.1;
  return Array.from({ length: CANDIDATE_COUNT }, (_, index) =>
    Math.round(start + (span * index) / (CANDIDATE_COUNT - 1)),
  );
}
