import { useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Pressable, Text } from '@/components/ui';
import { accentGradient, colors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';

const SLIDES = [
  { key: 'gps', icon: 'locate' as const },
  { key: 'offline', icon: 'cloud-offline' as const },
  { key: 'anonymous', icon: 'eye-off' as const },
];

/**
 * Three slides explaining the app's non-obvious behaviours before first use.
 *
 * Each one pre-empts a moment that would otherwise read as a bug: a camera that
 * refuses to open, a report that appears not to send, and an "anonymous" label
 * whose limits people assume rather than read.
 */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const { width } = Dimensions.get('window');
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const finish = async (destination: '/(auth)/sign-in' | '/(tabs)') => {
    await completeOnboarding();
    router.replace(destination);
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row justify-end px-4 py-2">
        <Pressable onPress={() => void finish('/(tabs)')} accessibilityLabel={t('common.skip')}>
          <Text variant="body-sm" tone="muted" className="font-sans-semibold">
            {t('common.skip')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {SLIDES.map((slide) => (
          <View
            key={slide.key}
            style={{ width }}
            className="items-center justify-center gap-6 px-10"
          >
            <LinearGradient
              colors={[...accentGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 108,
                height: 108,
                borderRadius: 34,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={slide.icon} size={46} color={colors.textOnDark} />
            </LinearGradient>
            <View className="gap-3">
              <Text variant="display-md" className="text-center">
                {t(`onboarding.${slide.key}.title`)}
              </Text>
              <Text variant="body-lg" tone="muted" className="text-center">
                {t(`onboarding.${slide.key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="flex-row justify-center gap-2 pb-6">
        {SLIDES.map((slide, i) => (
          <View
            key={slide.key}
            className={
              i === index
                ? 'h-2 w-6 rounded-pill bg-accent'
                : 'h-2 w-2 rounded-pill bg-canvas-raise'
            }
          />
        ))}
      </View>

      <View className="gap-3 px-6" style={{ paddingBottom: insets.bottom + 20 }}>
        <Button
          label={isLast ? t('onboarding.createAccount') : t('common.next')}
          size="lg"
          fullWidth
          onPress={() => {
            if (isLast) {
              void finish('/(auth)/sign-in');
            } else {
              scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
            }
          }}
        />
        {isLast ? (
          <Button
            label={t('onboarding.continueWithout')}
            variant="glass"
            fullWidth
            onPress={() => void finish('/(tabs)')}
          />
        ) : null}
      </View>
    </View>
  );
}
