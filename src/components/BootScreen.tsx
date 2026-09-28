import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { DawuroWordmark, GnaMark, ProvidedBy } from '@/components/Brand';
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
    // `canvas`, not `canvasSoft` — this has to be the exact colour the native
    // splash was painted in, or the handover between them shows as a flash of a
    // slightly different ground.
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: c.canvas }}>
      <Animated.View style={{ opacity: fade }} className="items-center">
        <DawuroWordmark size={46} />
      </Animated.View>

      {/*
        Both organisations, at the foot, under the name.

        The GNA mark sits with the words rather than above them: the agency is
        what makes this credible, and a stranger reading "Ghana News Agency"
        should see the mark they already recognise beside it. Kept small and
        kept low, because a credit that competes with the product's own name
        stops being a credit.
      */}
      <Animated.View
        style={{ opacity: fade }}
        className="absolute bottom-14 items-center gap-2.5 px-8"
      >
        <GnaMark size={40} />
        <ProvidedBy />
      </Animated.View>
    </View>
  );
}
