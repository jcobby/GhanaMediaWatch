import { Image } from 'expo-image';
import {
  Text as RNText,
  View,
  type StyleProp,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
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
  credits = 'both',
  style,
}: {
  /**
   * Which organisations this credits.
   *
   * `both` is the introduction, where the credit is the statement — the reader
   * has just met the product and is being told who stands behind it.
   *
   * `poweredBy` is for a screen that has already named the agency somewhere
   * more prominent. The launch screen shows GNA's full lockup at 127pt inside
   * the app tile; repeating "Sponsored by" under it with the same mark a third
   * of the size is the same organisation credited twice in one glance, and the
   * smaller one only makes the larger one look less deliberate.
   */
  credits?: 'both' | 'poweredBy';
  /**
   * Font size in points. The marks scale with it.
   *
   * The launch screen keeps the default — a credit at the foot of a brand
   * moment should not compete with the name above it. The introduction asks for
   * more, because there it *is* the statement.
   */
  size?: number;
  reversed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();

  /*
   * Rows, not a sentence with images in it.
   *
   * React Native does allow an `<Image>` nested inside `<Text>`, and it is the
   * obvious way to write this — but its vertical alignment is set by the text
   * baseline and cannot be nudged, so a square mark sits low against lowercase
   * type on one platform and low-ish on the other. Laying the runs out in flex
   * rows instead lets every piece centre on the same line.
   */
  const words = {
    fontFamily: 'Inter_500Medium' as const,
    fontSize: size,
    lineHeight: Math.round(size * 1.45),
    letterSpacing: 0.1,
    color: reversed ? 'rgba(255,255,255,0.72)' : colors.textMuted,
  };
  /*
   * Both logos, sized so the two lines come out the same length.
   *
   * **The two rows did not rhyme, and that is what made the block feel
   * wrong.** One line was `label + logotype`; the other was `label + the name
   * typed in Inter Bold + a bare grid icon`. So a company name appeared twice
   * on adjacent lines in two different typefaces, and the eye read the pair as
   * two unrelated things stacked rather than as one credit with two lines.
   * Each row being centred on its own made it worse: the labels began at
   * different x, so there was no edge anywhere for the eye to settle on.
   *
   * Both are logotypes now. The sizes are not equal and cannot be — these
   * lockups are shaped nothing alike. The agency's is 600 x 288, three lines
   * deep; Softmasters' is 560 x 101, wide and flat. Matching their type sizes
   * would put the Softmasters logo at 244pt wide, which does not fit on a
   * phone next to "powered by".
   *
   * So they are matched on *row length* instead, which is the thing a reader
   * actually perceives. At 19pt: "Sponsored by" ~118 + 100 for the agency's
   * logo; "powered by" ~97 + 128 for Softmasters'. 226 against 233 — near
   * enough that two centred lines look like a block rather than a ragged pair.
   *
   * The size difference that falls out of this is not an accident to apologise
   * for. It is the sentence's own hierarchy: the agency sponsors, and is named
   * first and largest; Softmasters builds, and is named after.
   */
  const gnaLogo = Math.round(size * 2.5);
  const softmastersLogo = Math.round(size * 1.2);

  /*
   * The space between a run and the next, as a number rather than `gap-x-1.5`.
   *
   * That class produced nothing: the credit rendered as "Sponsored by▪GNA" with
   * the mark jammed against the words on both sides. Every other flex row in
   * this app uses plain `gap-*`, so `gap-x-*` had never been compiled into the
   * stylesheet — and a class NativeWind has not built is not an error, it is
   * simply no rule, which is why it went out looking deliberate.
   *
   * Scaled off `size`, because a fixed gap that reads as generous at 12pt is a
   * hairline at 20.
   */
  const gutter = Math.round(size * 0.42);

  /*
   * One row style, and it may wrap again.
   *
   * Wrapping was taken out when a row held three runs, because the break could
   * land between a name and the mark belonging to it. Each row is a label and
   * one logo now, so the only break available puts the logo under its own
   * label — which is exactly what should happen when somebody has turned
   * system text size up and "powered by" alone is most of the screen. A row
   * that cannot wrap would push its logo off the edge instead.
   */
  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: gutter,
  };

  return (
    <View
      accessibilityRole="text"
      /*
       * One sentence either way, naming exactly the organisations drawn.
       *
       * A screen reader gets the credit as a whole rather than as four
       * fragments — and when the sponsor row is not rendered it must not be
       * read out, or the label claims a credit that is not on the screen.
       */
      accessibilityLabel={
        credits === 'both'
          ? `${t('app.sponsoredBy')} ${t('app.gna')}, ${t('app.poweredBy')} ${t('app.softmasters')}`
          : `${t('app.poweredBy')} ${t('app.softmasters')}`
      }
      style={[{ alignItems: 'center', gap: Math.round(size * 0.35) }, style]}
    >
      {/*
        One organisation per line, words first, artwork last.

        Two things are deliberate here. The rows: this was a single wrapping
        row, so the break landed wherever the width ran out — "Sponsored by GNA
        powered by" on one line and "Softmasters" alone on the next — which
        separated a mark from the name it belongs to. And the order: the mark
        used to sit between "Sponsored by" and "GNA", interrupting the phrase
        it was meant to illustrate. A reader takes the words first and the
        artwork as their seal; putting the picture mid-phrase makes them stop
        and parse.

        Both rows are the same construction — a label, then that organisation's
        own logo. Neither name is typed, because both logos are lettering and
        setting the name again beside one is the word twice, inches apart, in
        two different faces.
      */}
      {credits === 'both' ? (
        <View style={row}>
          <RNText style={words}>{t('app.sponsoredBy')}</RNText>
          {/*
          The wordmark, and no "GNA" typed beside it.

          The row read `Sponsored by GNA ▪` with the agency's *symbol* — the
          gong-gong — as the mark. Two things were wrong with that. The symbol
          is the one Dawuro borrows as its own, so the slide showed the same
          drums twice, once at 176pt as the app's logo and once at 36pt as the
          agency's credit, which reads as the app crediting itself. And it is
          the symbol, not the logo: the agency's identity is the lettering.

          The logo carries "GNA" as its own largest element, so the name is not
          set again next to it — that would be the word twice, a few pixels
          apart, in two different faces.
        */}
          <GnaWordmark height={gnaLogo} />
        </View>
      ) : null}
      <View style={row}>
        <RNText style={words}>{t('app.poweredBy')}</RNText>
        {/*
          The full lockup, not the grid mark with the name typed next to it.

          The mark alone has no lettering, so the name had to be set beside it
          in Inter Bold — which put "Softmasters" in a different typeface from
          the one its own logo uses, directly under a row where the agency's
          name appeared only as artwork. Two names, two treatments, two lines.
          This is the same construction as the row above it.
        */}
        <SoftmastersLogo height={softmastersLogo} />
      </View>
    </View>
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
/**
 * The agency's complete lockup: the gong-gong, then GNA and its two lines.
 *
 * The third GNA asset, and each is a different amount of the same identity.
 * `GnaMark` is the gong-gong alone, which Dawuro borrows as its own mark;
 * `GnaWordmark` is the lettering alone, which credits the agency without
 * repeating drums that are already on the screen. This is both together, and
 * it is what belongs in a launch tile — the shape a phone draws around an app
 * icon wants a whole identity in it, not a fragment.
 *
 * Cropped from `assets/splash-icon.png` to its ink: 1024 square down to
 * 816 x 971, which removes about a fifth of the height in dead margin. Sizing
 * a component against artwork with built-in padding is how a logo ends up
 * looking small inside a box that is the right size.
 */
export function GnaLockup({
  height = 120,
  style,
}: {
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require('../../assets/brand/gna-lockup.png')}
      // 816 x 971 after cropping to the ink — taller than wide.
      style={[{ height, width: height * 0.84 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="Ghana News Agency — Digital Platform"
    />
  );
}

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
