import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

/**
 * The GNA marks, in one place.
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

/** The drums, bells and arc, without the wordmark. For small placements. */
export function GnaMark({
  size = 28,
  style,
  reversed = false,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
  /** Silver-and-gold artwork, for a dark ground. */
  reversed?: boolean;
}) {
  return (
    <Image
      source={
        reversed
          ? require('../../assets/brand/gna-mark-reversed.png')
          : require('../../assets/brand/gna-mark.png')
      }
      style={[{ width: size, height: size * 0.82 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="GNA Digital Platform"
    />
  );
}

/**
 * Mark and wordmark side by side, for a toolbar.
 *
 * The supplied artwork is portrait — mark stacked over the words — and at the
 * height a bar allows that leaves "GHANA NEWS AGENCY" about two pixels tall.
 * Laid out horizontally the words get the full height rather than a third of
 * it, which is the difference between the name being present and being a
 * smudge.
 */
export function GnaHorizontal({
  height = 30,
  style,
  reversed = false,
}: {
  height?: number;
  style?: StyleProp<ImageStyle>;
  /**
   * Silver-and-gold artwork, for a dark ground.
   *
   * The masthead needs this: it is black while the page under it is white, so
   * the standard black-type lockup would be invisible on it.
   */
  reversed?: boolean;
}) {
  return (
    <Image
      source={
        reversed
          ? require('../../assets/brand/gna-horizontal-reversed.png')
          : require('../../assets/brand/gna-horizontal.png')
      }
      // 897 x 260 reversed, 857 x 260 standard — near enough to share a ratio.
      style={[{ height, width: height * 3.42 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="GNA Ghana News Agency — Digital Platform"
    />
  );
}

/** The full lockup — mark, GNA, and the two lines beneath. */
export function GnaLogo({
  width = 210,
  style,
  reversed = false,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
  /** Silver-and-gold artwork, for a dark ground. */
  reversed?: boolean;
}) {
  return (
    <Image
      source={
        reversed
          ? require('../../assets/brand/gna-digital-platform-reversed.png')
          : require('../../assets/brand/gna-digital-platform.png')
      }
      // The lockup is portrait: 923 x 1093 in the source.
      style={[{ width, height: width * 1.184 }, style]}
      contentFit="contain"
      transition={0}
      accessibilityLabel="GNA Ghana News Agency — Digital Platform"
    />
  );
}
