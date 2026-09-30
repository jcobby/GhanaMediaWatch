import { useCallback, useEffect, useRef, useState } from 'react';
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
import { DawuroWordmark, GnaMark, ProvidedBy } from '@/components/Brand';
import { accentGradient, colors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { toast } from '@/stores/toastStore';

/**
 * The width reserved for Back and for Skip, so the wordmark between them stays
 * on the centre line whichever of the two is showing.
 *
 * Sized for "Back" plus its chevron — the longer of the two — at
 * `title-sm` semibold, with room to spare so neither wraps under a larger
 * system text size.
 */
const NAV_COLUMN = 84;

/**
 * The introduction's own type scale.
 *
 * Held here rather than inline so the two sizes are one decision each. The
 * heading is the only thing that varies, and it varies for one reason: the
 * opening slide's title is a single word and the other five are sentences.
 */
const HERO_TITLE = { fontSize: 42, lineHeight: 46, letterSpacing: -1.4 } as const;
const SLIDE_TITLE = { fontSize: 34, lineHeight: 40, letterSpacing: -1 } as const;
const BODY_SIZE = { fontSize: 19, lineHeight: 28 } as const;

/**
 * How long each slide holds before the introduction moves itself on.
 *
 * Long enough to read the longest body at a glance — "Built for the field" is
 * six lines at this size — and short enough that somebody who is not reading
 * still reaches the end. It stops on the last slide rather than looping: that
 * one ends in a choice, and a screen that slides away from three buttons while
 * somebody is deciding is worse than one that waits.
 */
const AUTO_ADVANCE_MS = 5000;

const TITLE_SIZE: Record<string, typeof HERO_TITLE | typeof SLIDE_TITLE> = {
  dawuro: HERO_TITLE,
};

const SLIDES: { key: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  /*
   * The name first.
   *
   * The introduction opened on "Film what is happening" under the GNA lockup,
   * so a new user was told what to do before being told what they had
   * installed — and the only name on the screen was somebody else's. A
   * stranger's first question is what this is, and the answer is a word most
   * of them already know the meaning of.
   */
  // No icon: this slide shows the mark itself, so a glyph here would be dead
  // copy waiting to be reinstated by somebody tidying up.
  { key: 'dawuro' },
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
 * The name sits in the header rather than taking a slide of its own, and the
 * first slide says what it means. Who stands behind the app is the strongest
 * thing it has to say to a stranger, so both organisations are credited under
 * the opening slide rather than on a screen nobody scrolls to.
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

  /*
   * Stop moving the moment somebody takes hold of it.
   *
   * A carousel that keeps advancing under a reader's thumb is the most
   * irritating version of this pattern: they swipe back to re-read a slide and
   * it slides away again five seconds later. Any deliberate act — a swipe, the
   * Back control, a dot — hands the pacing over for good.
   */
  const [autoAdvance, setAutoAdvance] = useState(true);
  const reducedMotion = useReducedMotion();

  /**
   * One way to move between slides, shared by Next, Back and the dots.
   *
   * `setIndex` is not called here: the scroll fires `onScroll`, which is the
   * single source of which slide is showing. Setting it here as well would give
   * the same fact two owners, and they disagree the moment a scroll is
   * interrupted — the dots would say one thing and the page show another.
   */
  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    },
    [width],
  );

  /** A move the reader made, which ends the automatic pacing. */
  const goToManually = (i: number) => {
    setAutoAdvance(false);
    goTo(i);
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

  /*
   * The introduction reads itself, until somebody takes over.
   *
   * Keyed on `index` so the clock restarts with each slide rather than running
   * free — a single interval drifts out of step the moment a scroll takes
   * longer than it does, and starts skipping slides.
   *
   * Three things stop it, and each is a case where moving on is the wrong
   * answer: the last slide, because it ends in a choice and sliding away from
   * three buttons mid-decision is worse than waiting; any deliberate move by
   * the reader; and a system preference for reduced motion, where an animation
   * nobody asked for is exactly what that setting is about.
   */
  useEffect(() => {
    if (!autoAdvance || isLast || reducedMotion) return;
    const timer = setTimeout(() => goTo(index + 1), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [autoAdvance, isLast, reducedMotion, index, goTo]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/*
        Both ways out of the introduction, in one row.

        Back sat at the bottom-left and Skip at the top-right — the two controls
        that leave a slide, placed at opposite corners of the screen, so neither
        was where you looked for the other. Navigation belongs together and at
        the top, which is where back has lived on every phone either of us has
        used.

        Three columns of equal width so the wordmark stays on the centre line
        whether or not Back is showing. The left column holds its width on the
        first slide rather than collapsing, or the name would shift sideways as
        soon as you pressed Next.

        `NAV_COLUMN` is wide enough for the longer of the two words plus its
        chevron, so neither ever wraps or truncates.
      */}
      <View className="flex-row items-center px-3" style={{ height: 56 }}>
        <View style={{ width: NAV_COLUMN }}>
          {index > 0 ? (
            <Pressable
              onPress={() => goToManually(index - 1)}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              // A 56pt row and a full-height target: the old one was a 19pt
              // line of text, well under the 44pt floor the rest of the app holds.
              style={{ paddingRight: 8 }}
              className="h-full flex-row items-center gap-0.5"
            >
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              <Text variant="title-sm" tone="secondary" className="font-sans-semibold">
                {t('common.back')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View className="flex-1 items-center">
          <DawuroWordmark size={22} />
        </View>

        <View style={{ width: NAV_COLUMN }} className="items-end">
          {/*
            Not on the last slide, where "Continue without an account" is on
            screen and does exactly this. Two controls with one outcome, a
            thumb's width apart, is a choice that isn't one.
          */}
          {!isLast ? (
            <Pressable
              onPress={() => void finish('/(tabs)')}
              accessibilityRole="button"
              accessibilityLabel={t('common.skip')}
              style={{ paddingLeft: 8 }}
              className="h-full flex-row items-center"
            >
              <Text variant="title-sm" tone="secondary" className="font-sans-semibold">
                {t('common.skip')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        // A swipe is the clearest statement that somebody is reading at their
        // own pace; `onScrollBeginDrag` fires on the touch, not on the settle.
        onScrollBeginDrag={() => setAutoAdvance(false)}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {SLIDES.map((slide) => (
          /*
            Each slide scrolls if it has to, and otherwise sits centred.

            `flexGrow: 1` with `justifyContent: 'center'` is what gives both:
            short slides stay optically centred, and a slide taller than the
            screen scrolls instead of clipping its last line. That was already
            one slide away from happening — "Film, take a picture or stream
            what is happening" runs to three lines of heading and nine of body,
            which is 45pt past the bottom of an iPhone SE.

            It also covers the case no amount of copy-trimming would: a reader
            who has turned system text size up. That is the setting this app's
            whole light palette exists for, and until now it would have cut the
            safety line off the bottom of the slide that carries it.
          */
          <ScrollView
            key={slide.key}
            style={{ width }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingTop: 16,
              /*
                The opening slide sits high, not centred.

                Centring it between the header and the dots left the whole
                brand statement — mark, name, line, credit — floating in the
                middle of the screen with a hand's width of empty canvas above
                and below. Weighting the bottom padding pushes the optical
                centre up, which is where a title page belongs: the eye starts
                at the top of a page it is being introduced by.

                Vertical padding lives here rather than in `py-4` on the class
                list so there is no question which of the two wins.
              */
              paddingBottom: slide.key === 'dawuro' ? 108 : 16,
            }}
            contentContainerClassName="items-center gap-6 px-10"
            showsVerticalScrollIndicator={false}
          >
            {/*
              The mark itself on the slide that introduces the name; a glyph on
              the rest.

              The opening slide carried a bell in the accent tile like every
              other slide — chosen because a dawuro *is* a bell, which was
              reasoning about the word rather than about what a reader sees. On
              the one screen whose whole job is to say "this is Dawuro", a
              generic notification glyph reads as the logo, and the real mark
              sat below it at a third of the size looking like a footnote. So
              they swap places: the mark is the picture, and the credit under it
              is words alone.
            */}
            {slide.key === 'dawuro' ? (
              <GnaMark size={176} />
            ) : (
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
                <Ionicons name={slide.icon ?? 'ellipse'} size={46} color={colors.textOnDark} />
              </LinearGradient>
            )}
            {/*
              Every slide is set large; the opening one is set larger still.

              The introduction was typed at the app's ordinary body size, which
              is right for a screen somebody is working in and wrong for six
              screens somebody is *reading* — and for the reader this app is
              built around, whose contrast sensitivity is the reason the whole
              palette is light. So the body runs at 19 throughout and the
              headings at 34.

              `dawuro` keeps a larger heading because it is one word carrying
              the name of the product, where the rest are sentences: 42pt on
              "You are paid when it is used" would take three lines and read as
              shouting rather than as emphasis.

              Sized in `style` rather than by reaching for `display-lg`: that
              token maps to `Inter_800ExtraBold`, a weight `_layout.tsx` never
              loads, so it would quietly render in the system face. The variant
              stays `display-md` — `Inter_700Bold`, actually loaded — and only
              the size grows.
            */}
            <View className="gap-4">
              <Text variant="display-md" className="text-center" style={TITLE_SIZE[slide.key] ?? SLIDE_TITLE}>
                {t(`onboarding.${slide.key}.title`)}
              </Text>
              <Text variant="body-lg" tone="muted" className="text-center" style={BODY_SIZE}>
                {t(`onboarding.${slide.key}.body`)}
              </Text>
            </View>

            {/*
              The credit, set apart from the sentence above it.

              The marks used to sit in a row of their own below this line; they
              are in the line now, one against each name, which is what makes it
              read as a credit to two organisations rather than a caption above
              a logo bar. The extra space above is what keeps it a footer to the
              slide instead of a third paragraph of it.
            */}
            {slide.key === 'dawuro' ? (
              <ProvidedBy size={19} style={{ marginTop: 14 }} />
            ) : null}
          </ScrollView>
        ))}
      </ScrollView>

      {/*
        The dots, centred and on their own.

        Back moved to the header beside Skip, so this row is position and a way
        to jump — nothing else competes with it for the centre line.

        They are controls, not decoration: a reader who has just passed
        something they want to re-read should not have to swipe past it three
        times to get back to it.
      */}
      <View className="flex-row items-center justify-center gap-2 pb-6">
        {SLIDES.map((slide, i) => (
          <Pressable
            key={slide.key}
            onPress={() => goToManually(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={t(`onboarding.${slide.key}.title`)}
            // The dot is 8pt tall; the target around it is not.
            hitSlop={14}
          >
            <View
              className={
                i === index
                  ? 'h-2 w-6 rounded-pill bg-accent'
                  : 'h-2 w-2 rounded-pill bg-canvas-raise'
              }
            />
          </Pressable>
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
      {/*
        The last slide's block sits higher than the others.

        It carries three choices rather than one Next, and pinned to the same
        bottom margin the primary one ended up against the edge of the screen —
        on a phone with a home indicator, under the reader's thumb rather than
        in front of it.
      */}
      <View
        className="gap-3 px-6"
        style={{ paddingBottom: insets.bottom + (isLast ? 44 : 20) }}
      >
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
            onPress={() => goToManually(index + 1)}
          />
        )}
      </View>
    </View>
  );
}
