import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { DawuroWordmark, GnaLockup, ProvidedBy } from '@/components/Brand';
import { useColors } from '@/lib/theme';

/**
 * What the app shows while it starts.
 *
 * The native splash covers the very first moment, but it is dismissed the
 * instant fonts resolve — and the app is not ready then. The keychain still has
 * to be read, the database opened and the outbox counted. Previously that gap
 * rendered `null`, so launch went logo → blank → app, and the blank frame is
 * the one that reads as a crash on a slow handset.
 *
 * This fills the gap with the same mark the splash carries, so the transition
 * is a fade between two identical images rather than a flash of nothing.
 *
 * **It is also the only place the app says its own name at launch.** It used to
 * show the GNA lockup and a line reading "Developed by Softmasters" — so the
 * first thing a new user saw named the agency and the contractor, and never the
 * product they had just installed. Dawuro leads now, with both organisations
 * credited under it: the name first, then who stands behind it.
 *
 * It also solves a practical problem: **Expo Go does not reliably show the
 * splash configured in app.json** — it has its own. In Expo Go this component
 * is the only place the logo appears at launch, which matters because the
 * demo is run in Expo Go.
 */
/**
 * The side of the icon tile.
 *
 * Big enough to be the subject of the screen, short of filling it. Rather
 * larger than a launcher draws an app icon, which is right: a launcher shows
 * dozens at once and this shows one.
 *
 * **Every other measurement in the tile is derived from it**, so making the
 * tile bigger makes the lockup and the name bigger with it, in proportion,
 * from a single number. That is the whole reason they are fractions rather
 * than points — three hand-tuned figures drift apart the first time one of
 * them is adjusted alone.
 *
 * At 208 the tile is a little over half the width of a small phone, so it
 * still has generous margin either side on a 320pt screen.
 */
const TILE = 208;

/**
 * How far the build credit sits above the bottom edge.
 *
 * A fixed number rather than `useSafeAreaInsets()`, and that is forced rather
 * than lazy: `_layout.tsx` returns this component *before* it mounts
 * `SafeAreaProvider`, so the hook has no provider to read and would throw on
 * the one screen that must never fail. 64 clears a home indicator on every
 * phone this ships to with room to spare, and on a device without one it reads
 * as a deliberate margin rather than a gap left by a missing inset.
 */
const FOOT = 64;

export function BootScreen() {
  const c = useColors();
  /*
   * Created once, without reading a ref during render.
   *
   * `useRef(new Animated.Value(0)).current` reads `.current` while rendering,
   * which the React Compiler rejects — and it also constructs a fresh
   * `Animated.Value` on every render only to discard it. Lazy `useState` gives
   * the same "make it once" guarantee and is safe to read.
   */
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // A short fade rather than an appearing image. Boot is usually fast enough
    // that a hard cut reads as a flicker; easing over 260ms reads as the app
    // opening.
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  return (
    /*
      White, and the native splash was repainted white to match.

      This ground has one hard constraint: it must be the *exact* colour the
      native splash was painted in, or the handover between them shows as a
      flash of a slightly different page. It was `canvas` (#F4F5FA) for that
      reason. Moving it to white therefore could not be a one-line change here
      — `app.json` carries the same colour in two places, the window ground and
      the splash plugin, and both moved with it.

      The Android adaptive icon keeps #F4F5FA deliberately: that is the
      launcher tile on the home screen, not this screen, and nobody asked for
      the app's icon to change.
    */
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: c.canvasSoft }}
    >
      {/*
        One group, centred, rather than a name adrift and a credit taped to the
        bottom edge.

        This screen was a wordmark alone in the middle of an empty page, with
        the mark and the credit pinned to the very bottom — two unrelated
        things at opposite ends of a blank field, and nothing tying them
        together. Worse, the mark down there sat immediately above "Sponsored
        by the Ghana News Agency", so the app's own logo read as part of the
        agency's credit rather than as the product's.

        Everything is one stack now, in the same order the introduction uses:
        the product first, then who stands behind it. Two objects rather than
        four loose pieces — the tile, which carries both the mark and the name,
        and the credit well below it.
      */}
      <Animated.View style={{ opacity: fade }} className="items-center">
        {/*
          The mark in a tile, the way a phone already draws an app.

          A logo laid straight onto the page has no edge and no weight, so it
          reads as a picture that happens to be there. The rounded tile with a
          soft shadow is the shape every launcher and every app switcher puts
          around an icon, which is why it reads instantly as *this application
          starting* rather than as an illustration.

          Radius is 23% of the side, near the proportion iOS uses for an app
          icon. Sized and shadowed inline rather than through classes: a
          shadow is four properties that have to agree, and `rounded-[38px]`
          would be a first-ever use of that class — which NativeWind compiles
          from the class names present when Metro boots and would silently
          produce a square.
        */}
        <View
          style={{
            width: TILE,
            height: TILE,
            borderRadius: Math.round(TILE * 0.23),
            backgroundColor: c.canvasSoft,
            alignItems: 'center',
            justifyContent: 'center',
            /*
              The shadow is the tile's only edge now, so it has to carry.

              A white tile on a white page has no border and no contrast — take
              the shadow away and there is no box at all, just a logo on a
              page. That is a change of job: it was a hint that the tile sat
              above a tinted ground, and it is now the thing that draws the
              tile. So it is a wide, soft spread rather than the tight 10pt
              blur that was enough when the page underneath was #F4F5FA.

              The drop stays small against that spread. A large blur thrown far
              down reads as an object floating well above the page, which is
              not what an app tile does; a large blur barely offset reads as
              one resting on it, which is.

              iOS takes the four; Android takes `elevation` and ignores them.
            */
            shadowColor: '#0B1020',
            shadowOpacity: 0.16,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {/*
            The agency's complete lockup, which is what the tile is for.

            This held the gong-gong with "Dawuro" set under it — the app's own
            two-part mark. It is the agency's whole lockup instead: the drums,
            GNA, and the two lines beneath. The tile is the shape a phone draws
            around an app icon, and it reads best with one finished identity in
            it rather than a mark and a word assembled at render time.

            Sized off `TILE` so the tile stays one object, and from artwork
            cropped to its ink — the 1024-square source carries about a fifth
            of its height in dead margin, which would have left the logo
            looking small inside a box that is the right size.
          */}
          <GnaLockup height={Math.round(TILE * 0.62)} />
          {/*
            The app's own name, in the tile with the lockup above it.

            The agency's identity fills the tile, so without this the launch
            screen would never say what the reader actually installed — which
            is the fault this component was rebuilt to fix. Inside rather than
            captioned underneath: the tile is one object, and a word sitting
            just below it reads as a label for a picture instead of as the name
            of the thing.
          */}
          <DawuroWordmark size={Math.round(TILE * 0.15)} style={{ marginTop: 4 }} />
        </View>
      </Animated.View>

      {/*
        The builder's credit, at the foot of the screen.

        Two changes here, and the first explains the second. **The sponsor line
        is gone**: the agency's full lockup is now the largest thing on this
        screen, inside the app tile, and "Sponsored by" under it with the same
        mark a third of the size credited one organisation twice in a single
        glance — the smaller one only making the larger look less deliberate.

        What is left is Softmasters, and one line is a footer rather than a
        block. It sits at the bottom edge, which is where a build credit
        belongs and is what the tile above it can now carry: the earlier
        version of this screen put a credit down here under a *wordmark
        floating alone in an empty page*, and the two read as unrelated things
        at opposite ends of nothing. A finished tile holds the centre on its
        own.

        Absolutely positioned rather than spaced off the group, because the
        group is centred as a whole — every point of margin under it would lift
        the tile off centre by half as much.
      */}
      <Animated.View
        style={{ opacity: fade, position: 'absolute', left: 0, right: 0, bottom: FOOT }}
        className="items-center"
      >
        <ProvidedBy size={15} credits="poweredBy" />
      </Animated.View>
    </View>
  );
}
