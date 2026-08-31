import { lightColors, darkColors, type ThemeColors } from '@/lib/theme';
import fs from 'fs';
import path from 'path';

/**
 * The two palettes must stay in step.
 *
 * React Native needs colours as props for icons and status bars, so the tokens
 * are mirrored in TypeScript as well as in CSS. Four places now define the same
 * palette — `:root`, `.dark`, `lightColors`, `darkColors` — and a token added
 * to one and forgotten in another renders as `undefined`, which paints black.
 */

const CSS = fs.readFileSync(path.resolve(__dirname, '../../../global.css'), 'utf8');

function tokensIn(selector: string): string[] {
  const start = CSS.indexOf(selector);
  const block = CSS.slice(start, CSS.indexOf('}', start));
  return [...block.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]!).sort();
}

test('both TypeScript palettes carry the same keys', () => {
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
});

test('every colour is a real hex value', () => {
  for (const [name, palette] of [
    ['light', lightColors],
    ['dark', darkColors],
  ] as [string, ThemeColors][]) {
    for (const [key, value] of Object.entries(palette)) {
      expect(`${name}.${key}=${value}`).toMatch(/=#[0-9A-Fa-f]{6}$/);
    }
  }
});

test('the CSS blocks define the same tokens as each other', () => {
  const light = tokensIn(':root {');
  const dark = tokensIn('.dark:root,');
  expect(light.length).toBeGreaterThan(15);
  expect(dark).toEqual(light);
});

test('dark is not a copy of light', () => {
  // A palette that was added but never actually differentiated would pass every
  // check above while shipping a light app under a dark label.
  const same = Object.keys(lightColors).filter(
    (k) =>
      lightColors[k as keyof ThemeColors].toLowerCase() ===
      darkColors[k as keyof ThemeColors].toLowerCase(),
  );
  // Two are legitimately identical. `textOnDark` is fixed white for accent
  // fills; `glassMedia` is the frost over photography, which is dark in both
  // themes because it sits on an arbitrary photo rather than on the page.
  expect(same.sort()).toEqual(['glassMedia', 'textOnDark']);
});

test('dark grounds are lifted off pure black', () => {
  // True #000 with light text haloes on OLED — the specific complaint people
  // have about dark modes that hurt to read.
  expect(darkColors.canvas).not.toBe('#000000');
  const lum = parseInt(darkColors.canvas.slice(1, 3), 16);
  expect(lum).toBeGreaterThan(8);
});
