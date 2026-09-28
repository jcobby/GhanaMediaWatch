import { Image } from 'expo-image';
import { Text as RNText, type StyleProp, type ImageStyle, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/lib/theme';

/**
 * The product's own name.
 *
 * **Dawuro is the app; the Ghana News Agency is who stands behind it.** Those
 * are two different claims and the app was only ever making the second one —
 * the masthead, the launch screen, the introduction and the media overlays all
 * carried the GNA lockup, so a stranger who installed this had no way to learn
 * what the thing on their phone was called. The name was in `app.json` and
 * nowhere a user could see it.
 *
 * Set in type rather than drawn, because there is no Dawuro artwork: the brand
 * assets in this repo are all GNA's. Type is the honest answer to that — a
 * wordmark in the app's own face, at the app's own tracking — rather than
 * artwork invented here and then contradicted when the real thing arrives.
 *
 * `Inter_700Bold` explicitly, and deliberately **not** the `font-display`
 * class. That token maps to `Inter_800ExtraBold`, which this app never loads —
 * `_layout.tsx` registers 400, 500, 600 and 700 — so a wordmark built on it
 * would silently render in the system face on every device. A name is the one
 * string that must not be at the mercy of a font fallback.
 *
 * A dawuro is the gong-gong: the bell a town crier sounds to gather people for
 * news. The introduction says so, because a name that explains itself is worth
 * more than one that has to be learned.
 */
export function DawuroWordmark({
  size = 30,
  reversed = false,
  style,
}: {
  /** Cap height in points, near enough — this is set as a font size. */
  size?: number;
  /** White lettering, for the masthead and media overlays. */
  reversed?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <RNText
      accessibilityRole="header"
      accessibilityLabel="Dawuro"
      /*
       * A wordmark does not reflow with the accessibility text size. Everything
       * else in the app does and should; this is a mark that happens to be made
       * of letters, and at 200% it would push the search icon off the bar.
       */
      allowFontScaling={false}
      style={[
        {
          fontFamily: 'Inter_700Bold',
          fontSize: size,
          // Room for the descender on the p-height; RN clips a tight line box.
          lineHeight: size * 1.18,
          // The tight tracking the rest of the display type uses.
          letterSpacing: size * -0.03,
          color: reversed ? colors.textOnDark : colors.textPrimary,
        },
        style,
      ]}
    >
      Dawuro
    </RNText>
  );
}

/**
 * Who provides it, under the name.
 *
 * One component rather than a line of copy repeated at each site, because this
 * is a credit two organisations are named in and the wording of it is not a
 * detail any one screen should be free to paraphrase.
 */
export function ProvidedBy({
  size = 12,
  reversed = false,
  style,
}: {
  /**
   * Font size in points.
   *
   * The launch screen keeps the default — a credit at the foot of a brand
   * moment should not compete with the name above it. The introduction asks for
   * more, because there it *is* the statement: the slide exists to say what
   * Dawuro is and who stands behind it, and a credit set at footnote size
   * undersells two organisations who are named on purpose.
   */
  size?: number;
  reversed?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  return (
    <RNText
      style={[
        {
          fontFamily: 'Inter_500Medium',
          fontSize: size,
          // Generous, because this wraps to two lines on a narrow phone and a
          // tight leading on a centred credit reads as cramped.
          lineHeight: Math.round(size * 1.45),
          letterSpacing: 0.1,
          textAlign: 'center',
          color: reversed ? 'rgba(255,255,255,0.72)' : colors.textMuted,
        },
        style,
      ]}
    >
      {t('app.providedBy')}
    </RNText>
  );
}

/**
 * Softmasters' lockup — the grid mark and the two lines of type.
 *
 * Supplied as a JPEG on white, so the white is lifted to transparency the same
 * way the agency's symbol is: alpha from distance-to-white, edges
 * un-premultiplied. The noise floor is higher here (20 rather than 12) because
 * JPEG is the worst case for red on white — the chroma ringing around the
 * letters is a haze of 240-250 that a lower floor keeps as grey fog the moment
 * the mark sits on anything but pure white.
 *
 * One variant only. Everywhere it currently appears — the introduction, the
 * launch screen — is the light canvas. The red holds there; it would not hold
 * on the black masthead, and there is no reversed artwork, so a dark surface
 * needs one supplied rather than one invented here.
 */
export function SoftmastersLogo({
  height = 20,
  style,
}: {
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require('../../assets/brand/softmasters.png')}
      // 560 x 101 after cropping to the ink.
      style={[{ height, width: height * 5.545 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="Softmasters Business Solutions"
    />
  );
}

/**
 * The GNA mark.
 *
 * Official artwork, in both of its supplied forms: the standard lockup with
 * black letters and brown drums, and the reversed one with silver letters and
 * gold drums for dark grounds.
 *
 * The variant is passed in, because the app has one appearance and the ground
 * under a mark is now a property of the surface rather than of a theme. Nearly
 * everything sits on the white page and takes the default; the masthead and
 * media overlays are dark, and say so.
 */

/**
 * The agency's symbol: the gong-gong, the drums and the flag arc.
 *
 * **The supplied `gna_symbol.png`, with the white lifted off it.** It arrived
 * as RGB with no alpha — line art on a white rectangle — which is a white tile
 * on the launch screen's off-white page and a white box on the black masthead.
 * Two files are generated from it, cropped to the ink:
 *
 *   `gna-symbol.png`           alpha from distance-to-white, colours as drawn
 *   `gna-symbol-reversed.png`  the same, with the gong-gong's near-neutral
 *                              black flipped to white for a dark ground
 *
 * Only pixels that were already partly white are touched, so the red, yellow
 * and green of the arc and the brown of the drums are the artwork's own values
 * and not something a script computed. Edge pixels get partial alpha and are
 * un-premultiplied against the white they were composited on, so no curve
 * carries a halo. A noise floor throws away alpha below 12/255: the supplied
 * file has been through lossy compression and its "white" is a field of 252-254
 * that otherwise became forty thousand faintly-visible specks the moment the
 * mark was laid on black.
 *
 * The reversed variant exists because `reversed` is offered: rendering the
 * standard file on a dark ground would lose the gong-gong entirely, silently,
 * and that is the part of the mark this app is named after.
 */
export function GnaMark({
  size = 28,
  style,
  reversed = false,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
  /** The gong-gong in white, for a dark ground. */
  reversed?: boolean;
}) {
  return (
    <Image
      source={
        reversed
          ? require('../../assets/brand/gna-symbol-reversed.png')
          : require('../../assets/brand/gna-symbol.png')
      }
      // 480 x 408 after cropping to the ink.
      style={[{ width: size, height: size * 0.85 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="Ghana News Agency"
    />
  );
}

/**
 * The agency's wordmark: GNA with the flag in the A, its name, and the line.
 *
 * **Supplied artwork with no drums in it, which is why it is here.** The
 * introduction shows the agency's *symbol* large at the top — Dawuro borrows it
 * as its own mark — and credits the agency at the foot. Using `GnaHorizontal`
 * for that credit put the same drums on the slide twice, at two sizes, a few
 * inches apart. This carries the name and nothing that is already above it.
 *
 * White lifted to transparency the same way as the symbol, from a clean PNG so
 * the noise floor stays at 12.
 */
export function GnaWordmark({
  height = 34,
  style,
}: {
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require('../../assets/brand/gna-wordmark.png')}
      // 600 x 288 after cropping to the ink.
      style={[{ height, width: height * 2.083 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="Ghana News Agency — Digital Platform"
    />
  );
}
