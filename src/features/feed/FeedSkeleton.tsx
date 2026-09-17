import { useWindowDimensions, View } from 'react-native';
import { LEAD_IMAGE_RATIO } from './leadLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Skeleton } from '@/components/ui';
import { GnaHomeLogo } from '@/components/Brand';

/**
 * The feed while it loads, shaped exactly like what replaces it.
 *
 * Menu bar, tabs, a full-bleed lead with a large headline under it, then rows
 * with the picture on the left. A skeleton that does not match its content is
 * worse than none: the shift when data arrives reads as the screen reloading,
 * and this is the first thing anybody sees of the app.
 *
 * Widths go through `style`. Arbitrary Tailwind values like `w-[70%]` do not
 * compile in this NativeWind setup and silently collapse.
 */
export function FeedSkeleton() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const thumbWidth = Math.round(width * 0.4);
  const thumbHeight = Math.round(thumbWidth * 0.58);

  return (
    <View className="flex-1 bg-canvas">
      <View className="bg-masthead" style={{ paddingTop: insets.top }}>
        {/* The loading bar is the dark masthead too, so the clock and battery
            above it need light icons — the app default is dark, for the page. */}
        <StatusBar style="light" />
        {/*
          The same bar `FeedBar` draws, not an approximation of it.

          This showed `GnaHorizontal` — the full lockup, drums and bells and the
          "Ghana News Agency" line — while the bar it precedes shows
          `GnaHomeLogo`, the wordmark and flag triangle alone. So the first thing
          anybody saw of the app was one logo replaced by a different one the
          moment the feed landed, which reads as the screen reloading.

          The mark is not data: it is drawn for real, at the height and offset
          the real bar uses, and the two icon buttons are laid out where the
          search and institutions buttons will be. Nothing moves when the feed
          arrives.
        */}
        <View className="flex-row items-center px-2" style={{ height: 56 }}>
          <View className="h-11 w-11 items-center justify-center">
            <Skeleton className="h-6 w-6 rounded-xs" />
          </View>
          <GnaHomeLogo height={24} style={{ marginLeft: 8 }} />
          <View className="flex-1" />
          <View className="h-11 w-11 items-center justify-center">
            <Skeleton className="h-6 w-6 rounded-pill" />
          </View>
          <View className="h-11 w-11 items-center justify-center">
            <Skeleton className="h-6 w-6 rounded-pill" />
          </View>
        </View>
        <View className="flex-row gap-7 px-5 pb-4 pt-2">
          <Skeleton className="h-3 w-16 rounded-xs" />
          <Skeleton className="h-3 w-24 rounded-xs" />
          <Skeleton className="h-3 w-20 rounded-xs" />
        </View>
      </View>

      <View style={{ width, height: Math.round(width * LEAD_IMAGE_RATIO) }}>
        <Skeleton className="h-full w-full rounded-none" />
      </View>
      <View className="gap-2.5 px-4 pb-5 pt-4">
        <Skeleton className="h-6 w-full rounded-xs" />
        <View style={{ width: '80%' }}>
          <Skeleton className="h-6 w-full rounded-xs" />
        </View>
        <Skeleton className="mt-1 h-3 w-24 rounded-xs" />
      </View>
      <View className="h-2 bg-canvas-soft" />

      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          className="flex-row"
          style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 12 }}
        >
          <View style={{ width: thumbWidth, height: thumbHeight }}>
            <Skeleton className="h-full w-full rounded-none" />
          </View>
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-full rounded-xs" />
            <View style={{ width: '85%' }}>
              <Skeleton className="h-4 w-full rounded-xs" />
            </View>
            <View style={{ width: '50%' }}>
              <Skeleton className="h-4 w-full rounded-xs" />
            </View>
            <View style={{ width: '60%' }}>
              <Skeleton className="mt-1 h-3 w-full rounded-xs" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
