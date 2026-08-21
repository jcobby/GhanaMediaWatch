import { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';

interface FeedVideoProps {
  uri: string;
  posterUri: string;
  /** Only the in-view cell plays. Everything else pauses. */
  isActive: boolean;
  muted: boolean;
}

/**
 * The video surface for a feed cell.
 *
 * One player per cell, controlled by `isActive`. The feed keeps a small window
 * of cells mounted, so without this gate several players would decode
 * simultaneously — which is both the fastest way to drain a battery and the
 * reason two soundtracks sometimes overlap in badly-built feeds.
 *
 * The poster stays mounted underneath until the first frame is ready. Without
 * it the cell flashes black on every swipe, which reads as a stutter even when
 * the scroll itself is smooth.
 */
export function FeedVideo({ uri, posterUri, isActive, muted }: FeedVideoProps) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    // Never autoplay on creation — `isActive` is the only thing that starts
    // playback, so an off-screen cell cannot begin playing as it mounts.
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const showPoster = status !== 'readyToPlay';

  return (
    <View className="absolute inset-0">
      <VideoView
        player={player}
        style={{ position: 'absolute', inset: 0 }}
        contentFit="cover"
        // The feed has its own controls; the native overlay would fight them.
        nativeControls={false}
        // Full-screen and PiP belong on the detail screen, not in a pager where
        // an accidental tap would break the scroll.
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {showPoster ? (
        <Image
          source={{ uri: posterUri }}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
          transition={0}
          accessibilityElementsHidden
        />
      ) : null}
    </View>
  );
}
