import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton } from '@/components/ui';

/**
 * Loading placeholder for the feed.
 *
 * Shaped like a real cell — media block, chips, caption lines, action rail —
 * rather than one flat rectangle. An earlier version filled the screen with a
 * single skeleton in `canvas-raise`, which sits within a few percent luminance
 * of `canvas`; the result was indistinguishable from a blank screen, so a stuck
 * request looked like a broken app.
 */
export function FeedSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-canvas-raise">
      {/* Top chips */}
      <View className="absolute left-4 flex-row gap-2" style={{ top: insets.top + 10 }}>
        <Skeleton className="h-7 w-24 rounded-pill" />
        <Skeleton className="h-7 w-16 rounded-pill" />
      </View>

      {/* Action rail */}
      <View className="absolute right-4 gap-5" style={{ bottom: insets.bottom + 190 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="items-center gap-1.5">
            <Skeleton className="h-11 w-11 rounded-pill" />
            <Skeleton className="h-2.5 w-7 rounded-pill" />
          </View>
        ))}
      </View>

      {/* Caption block */}
      <View className="absolute left-4 right-20 gap-3" style={{ bottom: insets.bottom + 80 }}>
        <View className="flex-row items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-pill" />
          <Skeleton className="h-3.5 w-28 rounded-pill" />
        </View>
        <Skeleton className="h-4 w-full rounded-pill" />
        <Skeleton className="h-4 w-4/5 rounded-pill" />
        <Skeleton className="h-3 w-1/2 rounded-pill" />
        <Skeleton className="h-10 w-32 rounded-pill" />
      </View>
    </View>
  );
}
