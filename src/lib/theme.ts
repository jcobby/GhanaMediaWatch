/**
 * TypeScript mirror of the design tokens in global.css / tailwind.config.js.
 *
 * Needed because some RN APIs take colours as props rather than styles
 * (StatusBar, ActivityIndicator, vector icons, gradient stops, map markers).
 * Anything that *can* be a className must use one — this is the escape hatch,
 * not an alternative styling system.
 *
 * There is one palette. A dark/light switch lived here and was removed — see
 * global.css for why. `useColors()` remains the way to read it, so a call site
 * asks for the palette rather than hard-coding one, but it now has a single
 * answer for every caller.
 */

export const lightColors = {
  masthead: '#1A1A1D',
  canvas: '#F4F5FA',
  canvasSoft: '#FFFFFF',
  canvasRaise: '#E9ECF4',

  glass: '#FFFFFF',
  glassMedia: '#10111A',
  hairline: '#0E1024',

  textPrimary: '#0B0C14',
  textSecondary: '#3A3D4D',
  textMuted: '#474B5E',
  textFaint: '#7A7F94',
  /** Fixed white — media overlays and accent fills only. */
  textOnDark: '#FFFFFF',

  accent: '#5B3DF5',
  accentAlt: '#2563EB',
  accentBright: '#7C5CFF',
  accentWash: '#EDE9FE',

  success: '#0B7A4B',
  warning: '#A25C00',
  danger: '#C1121F',
  info: '#1D4ED8',
  live: '#C81238',
} as const;

/**
 * Widened off the literals `as const` produces. The two palettes must share a
 * shape, not values — and `#0E101A` is not assignable to `"#F4F5FA"`.
 */
export type ThemeColors = Record<keyof typeof lightColors, string>;

/**
 * The signature gradient — violet to blue, on primary actions and the capture
 * button. Kept as a tuple so every consumer renders identical stops; a gradient
 * that drifts between screens is the fastest way to make a design feel unowned.
 */
export const accentGradient = [lightColors.accent, lightColors.accentAlt] as const;

/**
 * Elevation presets.
 *
 * React Native 0.76+ on the New Architecture supports the CSS `boxShadow`
 * string, which is far easier to keep consistent than the four separate iOS
 * shadow props plus Android's `elevation`. Kept as a small closed set so cards
 * across the app cast the same light rather than each picking their own.
 *
 * The shadows are tinted toward the ink colour rather than pure black — a
 * neutral-black shadow on a cool page reads as grubby.
 */
export const shadow = {
  /** Resting cards and list rows. */
  sm: '0px 1px 2px rgba(14, 16, 36, 0.06), 0px 2px 8px rgba(14, 16, 36, 0.04)',
  /** Panels that float above content. */
  md: '0px 2px 4px rgba(14, 16, 36, 0.06), 0px 8px 24px rgba(14, 16, 36, 0.08)',
  /** Sheets, dialogs, the floating action bar. */
  lg: '0px 4px 8px rgba(14, 16, 36, 0.08), 0px 16px 40px rgba(14, 16, 36, 0.12)',
  /** Anything sitting directly on photography needs a darker, tighter cast. */
  onMedia: '0px 2px 12px rgba(0, 0, 0, 0.45)',
} as const;

/** Scrim ramp for text on media. Never a flat opacity block. */
export const scrimGradient = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] as const;

export const alpha = (hex: string, a: number): string => {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Incident category hues. Chosen to work on BOTH the light page and over dark
 * media, so they sit a step deeper than a light-only palette would need.
 * Colour is a secondary read — chips carry labels, pins carry icons.
 */
export const categoryColor = {
  fire: '#DC3A1E',
  accident: '#C25708',
  disorder: '#C2185B',
  infrastructure: '#A06800',
  utility: '#0E7C88',
  corruption: '#8A6D1F',
  environment: '#127A3E',
  wildlife: '#4F7A16',
  flood: '#1D68D6',
  crime: '#6D3BD4',
  health: '#B32E6E',
  other: '#5F6473',
} as const;

export type CategoryColorKey = keyof typeof categoryColor;

/**
 * A category's hue, for a category that came off the wire.
 *
 * `categoryHue(incident.category)` is an object lookup typed against the
 * categories this build ships. The category on a report is whatever the service
 * sent — including one added after this build — and the lookup then yields
 * `undefined`, which React Native renders as *no colour at all*: a chip with no
 * hue, a map pin that vanishes, a category rule that is simply absent.
 *
 * Quieter than the console's version of this bug, which crashed a whole route,
 * and the same cause. `other` is the honest fallback: the app genuinely does not
 * know what this is.
 */
export function categoryHue(category: string): string {
  return categoryColor[category as CategoryColorKey] ?? categoryColor.other;
}

/**
 * The app's palette.
 *
 * A hook rather than a bare export so every call site stays a component
 * concern, and so a second palette could return here without touching the
 * forty-six files that read it.
 *
 * There is one theme: a black masthead over a white page. Switching was built
 * and then removed — it produced an app that could be dark when nobody had
 * asked for it, because a stored choice, an OS setting and an in-app default
 * were three sources of truth for one question.
 */
export function useColors(): ThemeColors {
  return lightColors;
}

/**
 * The palette under its old name, for non-component code and tests.
 */
export const colors = lightColors;
