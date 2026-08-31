import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton } from '@/components/ui';

/**
 * The feed while it loads.
 *
 * Shaped like the rows that replace it — thumbnail left, three lines of
 * headline, a short meta line — so nothing jumps when data arrives. A skeleton
 * that does not match its content is worse than none, because the shift on
 * arrival reads as the screen reloading.
 *
 * Six rows rather than two: the list layout fits about seven on a phone, and a
 * skeleton that stops after two implies the feed is nearly empty.
 */
export function FeedSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-canvas-soft" style={{ paddingTop: insets.top }}>
      {/* Bar */}
      <View className="flex-row items-center gap-2 px-4 pb-2.5 pt-1">
        <Skeleton className="h-5 w-28 rounded-xs" />
        <View className="flex-1" />
        <Skeleton className="h-9 w-9 rounded-pill" />
        <Skeleton className="h-9 w-9 rounded-pill" />
      </View>

      {/* Category tabs */}
      <View className="flex-row gap-5 border-b border-hairline/[0.08] px-4 pb-3 pt-3">
        <Skeleton className="h-3 w-14 rounded-xs" />
        <Skeleton className="h-3 w-16 rounded-xs" />
        <Skeleton className="h-3 w-12 rounded-xs" />
        <Skeleton className="h-3 w-20 rounded-xs" />
      </View>

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} className="flex-row gap-3 border-b border-hairline/[0.06] px-4 py-3.5">
          <View style={{ width: 112, height: 86 }}>
            <Skeleton className="h-full w-full rounded-sm" />
          </View>
          <View className="flex-1 justify-between py-0.5">
            <View className="gap-1.5">
              <Skeleton className="h-3.5 w-full rounded-xs" />
              <Skeleton className="h-3.5 w-[85%] rounded-xs" />
              {/* The third line is short, as a wrapped headline usually is. */}
              <Skeleton className="h-3.5 w-[45%] rounded-xs" />
            </View>
            <Skeleton className="mt-1.5 h-2.5 w-32 rounded-xs" />
          </View>
        </View>
      ))}
    </View>
  );
}
