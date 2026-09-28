import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * A country's flag, drawn rather than fetched or typed.
 *
 * **Not emoji.** `🇬🇭` is the obvious answer and it fails on the devices this
 * app is for: Android renders regional-indicator pairs as the bare letters
 * "GH" on a great many handsets, and there is no way to detect that at runtime
 * — so the masthead would show a flag on the reviewer's iPhone and two grey
 * capitals on a reader's phone in Accra, with nothing in any test to catch it.
 *
 * **Not image assets either.** A dozen PNGs for a control that currently offers
 * one live country is a lot of bytes in the bundle for something that is three
 * coloured rectangles.
 *
 * So each flag is bands plus, where the flag has one, a centred glyph. That is
 * faithful for the West African flags below — all of them are plain tricolours
 * with at most a star — and it renders identically everywhere. A flag with real
 * heraldry in it (Kenya's shield, Eswatini's) cannot be drawn this way and is
 * deliberately absent rather than approximated: a wrong flag is worse than no
 * flag, and considerably worse in a product about verifying what is true.
 */

export interface FlagDesign {
  /** Band colours, in order. */
  bands: string[];
  /** Which way the bands run. */
  direction: 'horizontal' | 'vertical';
  /** A star at the centre, where the flag carries one. */
  star?: string;
}

export function Flag({
  design,
  size = 22,
  style,
}: {
  design: FlagDesign;
  /** The **width**; flags here are drawn at 3:2, the commonest ratio. */
  size?: number;
  style?: { marginLeft?: number; marginRight?: number };
}) {
  const height = Math.round((size * 2) / 3);
  const horizontal = design.direction === 'horizontal';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height,
          borderRadius: 3,
          overflow: 'hidden',
          flexDirection: horizontal ? 'column' : 'row',
          /*
           * A hairline edge, because several of these have a white band that
           * would otherwise bleed into a light sheet and leave the flag looking
           * like two stripes floating apart.
           */
          borderWidth: 0.5,
          borderColor: 'rgba(14,16,36,0.16)',
        },
        style,
      ]}
    >
      {design.bands.map((colour, i) => (
        <View key={`${colour}-${i}`} style={{ flex: 1, backgroundColor: colour }} />
      ))}

      {design.star ? (
        <View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="star" size={Math.round(height * 0.45)} color={design.star} />
        </View>
      ) : null}
    </View>
  );
}
