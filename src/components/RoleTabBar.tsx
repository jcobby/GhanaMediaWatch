import { Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Height of the bar's usable area, before the device's bottom inset. */
export const TAB_CONTENT_HEIGHT = 56;

/**
 * Bottom padding a tab-root scroll view needs so its last row clears the bar.
 *
 * Derived rather than written out, because the failure is silent: a screen
 * with too little padding looks fine until you scroll to the end, and the
 * number drifts the moment the bar's height changes.
 */
export const TAB_SCROLL_CLEARANCE = TAB_CONTENT_HEIGHT + 40;

/**
 * Shared tab-bar chrome for all three roles.
 *
 * The three experiences have different tabs but must feel like one app, so the
 * bar's material, height and inset handling live here rather than being
 * re-derived in each layout — that is how three navigation bars end up three
 * different heights.
 */
export function useTabScreenOptions() {
  const insets = useSafeAreaInsets();

  return {
    headerShown: false as const,
    tabBarShowLabel: true as const,
    tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 10.5, marginTop: 3 },
    tabBarStyle: {
      position: 'absolute' as const,
      borderTopWidth: 0,
      backgroundColor: 'transparent',
      elevation: 0,
      // The inset is padding, not extra height — a fixed height leaves the
      // home indicator's space as dead area under the labels.
      height: TAB_CONTENT_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 8,
    },
    tabBarItemStyle: { paddingVertical: 0 },
    tabBarBackground: () =>
      Platform.OS === 'android' ? (
        // Android blur costs frames in a video feed; a near-opaque fill reads
        // almost identically and stays smooth.
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.97)' }} />
      ) : (
        <BlurView intensity={70} tint="light" style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
        </BlurView>
      ),
  };
}
