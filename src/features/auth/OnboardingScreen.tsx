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
import { GnaHorizontal } from '@/components/Brand';
import { accentGradient, colors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';

const SLIDES = [
  { key: 'what', icon: 'videocam' as const },
  { key: 'reaches', icon: 'send' as const },
  { key: 'earn', icon: 'cash' as const },
  { key: 'field', icon: 'locate' as const },
  { key: 'anonymous', icon: 'eye-off' as const },
];

/**
 * What a first-time user needs before they open the camera.
 *
 * The first three answer the questions somebody actually arrives with — what is
 * this, what happens to what I send, and what do I get. None of that was here
 * before: the intro opened on "Verified location, every time", which is an
 * answer to a question nobody has yet.
 *
 * The last two pre-empt moments that would otherwise read as bugs — a camera
 * that refuses to open until it has a GPS fix, and an "anonymous" label whose
 * limits people assume rather than read. Those are kept because they earn their
 * place: both are complaints the app would otherwise receive.
 *
 * The GNA lockup sits in the header rather than taking a slide of its own. Who
 * stands behind the app is the strongest thing it has to say to a stranger, and
 * it should be true on every screen of the introduction rather than on one.
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

  const finish = async (destination: '/(auth)/sign-in' | '/(auth)/sign-up' | '/(tabs)') => {
    await completeOnboarding();

    /*
     * Going straight to the feed is the one ending with nothing after it — the
     * other two land on a form that explains itself. Without a word here,
     * choosing "continue without an account" feels like the button dismissed
     * the introduction rather than made a decision.
     */
    if (destination === '/(tabs)') {
      toast.info(t('auth.guestTitle'), t('auth.guestBody'));
    }
    router.replace(destination);
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <GnaHorizontal height={22} />
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

      {/*
        The end of the introduction is a choice, not a funnel.
        
        Three routes, ordered by what a new install most likely wants: create an
        account, sign in to one they already have, or start reporting without
        either. All three are visible at once — burying "continue without an
        account" behind a skip link, on a product whose whole premise is that
        anonymous people can report safely, would contradict the slide before it.

        The primary button used to say "Create an account" and open the *sign-in*
        screen, which sent every new user to a form they could not complete.
      */}
      <View className="gap-3 px-6" style={{ paddingBottom: insets.bottom + 20 }}>
        {isLast ? (
          <>
            <Button
              label={t('onboarding.createAccount')}
              size="lg"
              fullWidth
              onPress={() => void finish('/(auth)/sign-up')}
            />
            <Button
              label={t('onboarding.haveAccount')}
              variant="glass"
              fullWidth
              onPress={() => void finish('/(auth)/sign-in')}
            />
            <Pressable
              onPress={() => void finish('/(tabs)')}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.continueWithout')}
              className="items-center py-2"
            >
              <Text variant="body-sm" tone="muted" className="font-sans-semibold">
                {t('onboarding.continueWithout')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Button
            label={t('common.next')}
            size="lg"
            fullWidth
            onPress={() => scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true })}
          />
        )}
      </View>
    </View>
  );
}
