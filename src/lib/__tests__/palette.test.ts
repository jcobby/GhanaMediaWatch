import { AAA_BODY_TEXT, NON_TEXT_MIN, contrastRatio, relativeLuminance } from '../contrast';
import { accentGradient, categoryColor, colors } from '../theme';

/*
 * Contrast guard for the "Glass & Depth" palette.
 *
 * The design is dark and media-forward, which changes what these tests should
 * assert compared with a document-style UI:
 *
 *  - Text on the app's own ground still has to clear AAA. There is no excuse
 *    for low-contrast body copy on a solid background.
 *  - Text over *media* is a different problem: the background is arbitrary
 *    footage, so legibility comes from the gradient scrim plus the text shadow
 *    on Text's `onMedia` prop, not from a colour pair. Nothing here can assert
 *    that; it is enforced by the gradient always being present under the
 *    capture stamp on the incident detail screen.
 *  - Category hues only need to be distinguishable and visible, not readable
 *    as body text — they are dots beside a label.
 */
describe('light glass palette', () => {
  const grounds = [colors.canvas, colors.canvasSoft, colors.canvasRaise] as const;

  it.each(['textPrimary', 'textSecondary', 'textMuted'] as const)(
    '%s clears AAA on every solid ground',
    (token) => {
      for (const ground of grounds) {
        expect(contrastRatio(colors[token], ground)).toBeGreaterThanOrEqual(AAA_BODY_TEXT);
      }
    },
  );

  it('textFaint is legible enough for non-essential labels', () => {
    // Deliberately below AAA — it is used for inactive tab labels and
    // timestamps, never for anything a user must read. Still must clear the
    // non-text floor so it does not vanish entirely.
    expect(contrastRatio(colors.textFaint, colors.canvas)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it.each(['success', 'warning', 'danger', 'info', 'live'] as const)(
    '%s reads at a glance on the dark ground',
    (token) => {
      // 4.5:1 rather than AAA: these are status marks in a fast-scrolling feed,
      // shown as fills and icons beside text, not as running copy.
      expect(contrastRatio(colors[token], colors.canvas)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('the white label is legible on both ends of the accent gradient', () => {
    /*
     * A gradient fill is only as accessible as its lightest stop — the label
     * has to survive the whole ramp, not just the average.
     *
     * **This was checking the wrong colour.** The name said white and the
     * assertion measured `textPrimary`, the near-black, against a violet
     * gradient at a 3:1 floor — the floor for *non-text*. The primary button
     * really was drawn that way, so the test was accurate and the button was
     * the problem: 3.19:1 on the label of the one control the eye is meant to
     * go to first.
     *
     * The label is white now, on a blue pair, and the floor is the one that
     * applies to text.
     */
    for (const stop of accentGradient) {
      expect(contrastRatio(colors.textOnDark, stop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the accent is distinguishable from the info blue beside it', () => {
    /*
     * Both are blue now, and they mean different things — accent is "press
     * this", info is "this was released". Not a contrast rule: a fixed minimum
     * separation so the two cannot converge into one colour through a later
     * nudge of either.
     */
    const apart = (a: string, b: string) =>
      Math.abs(relativeLuminance(a) - relativeLuminance(b));
    expect(apart(colors.accent, colors.info)).toBeGreaterThan(0.01);
  });

  it('the ground is not pure white', () => {
    // A pure #FFF full-screen ground flattens the frosted panels sitting on it.
    expect(colors.canvas.toUpperCase()).not.toBe('#FFFFFF');
  });

  it('white text is legible on a media-context glass panel', () => {
    // Overlays on photography force white text; the dark frost is what makes
    // that readable, so the pair has to hold on its own.
    expect(contrastRatio(colors.textOnDark, colors.glassMedia)).toBeGreaterThanOrEqual(
      AAA_BODY_TEXT,
    );
  });
});

describe('category colours', () => {
  it.each(Object.entries(categoryColor))('%s is visible on the dark ground', (_key, hex) => {
    expect(contrastRatio(hex, colors.canvas)).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it('no two categories collapse into the same apparent colour', () => {
    const lab = (hex: string): [number, number, number] => {
      const h = hex.replace('#', '');
      const toLinear = (c: number): number => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const [r, g, b] = [0, 2, 4].map((i) => toLinear(Number.parseInt(h.slice(i, i + 2), 16))) as [
        number,
        number,
        number,
      ];
      let X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
      let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
      const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      [X, Y, Z] = [f(X), f(Y), f(Z)];
      return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    };

    const values = Object.values(categoryColor).map(lab);
    let worst = Number.POSITIVE_INFINITY;
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i]!;
        const b = values[j]!;
        worst = Math.min(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      }
    }
    // Colour is a secondary cue here — chips carry labels and pins carry icons
    // — so this guards against an outright collision, not perfect separation.
    expect(worst).toBeGreaterThan(12);
  });
});
