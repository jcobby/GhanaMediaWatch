/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Lives in src (not just in tests) because the org tier will let institutions
 * pick a brand tint for their dashboard, and we must be able to reject a tint
 * that would drop text below the legibility floor rather than render it.
 */

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) throw new Error(`Not a hex colour: "${hex}"`);
  return [r, g, b];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1..21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Body text must clear AAA for this app's target reader, not AA. Contrast
 * sensitivity roughly halves between 20 and 70, so the 4.5:1 AA floor that
 * suits a general audience is not enough here.
 */
export const AAA_BODY_TEXT = 7;

/** Non-text UI boundaries (borders, focus rings, icons) — WCAG 1.4.11. */
export const NON_TEXT_MIN = 3;
