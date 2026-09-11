/** @type {import('tailwindcss').Config} */

// Token colours resolve through CSS custom properties declared in global.css.
// `<alpha-value>` is load-bearing here: glass panels are the same token painted
// at different alphas (bg-glass/8, bg-glass/14, border-hairline/15).
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/*
 * Incident category colours.
 *
 * Bright and saturated because they sit on near-black or over video, where a
 * muted hue disappears. Each is a dot or a small chip beside a text label —
 * colour is a fast secondary read, never the only signal.
 *
 * Keys must stay in sync with IncidentCategory in src/types/api.ts.
 */
const category = {
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
};

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        masthead: withAlpha('--color-masthead'),
        canvas: {
          DEFAULT: withAlpha('--color-canvas'),
          soft: withAlpha('--color-canvas-soft'),
          raise: withAlpha('--color-canvas-raise'),
        },
        glass: {
          DEFAULT: withAlpha('--color-glass'),
          media: withAlpha('--color-glass-media'),
        },
        hairline: {
          DEFAULT: withAlpha('--color-hairline'),
          media: withAlpha('--color-hairline-media'),
        },
        text: {
          primary: withAlpha('--color-text-primary'),
          secondary: withAlpha('--color-text-secondary'),
          muted: withAlpha('--color-text-muted'),
          faint: withAlpha('--color-text-faint'),
          'on-dark': withAlpha('--color-text-on-dark'),
        },
        accent: {
          DEFAULT: withAlpha('--color-accent'),
          alt: withAlpha('--color-accent-alt'),
          bright: withAlpha('--color-accent-bright'),
          wash: withAlpha('--color-accent-wash'),
        },
        success: { DEFAULT: withAlpha('--color-success'), wash: withAlpha('--color-success-wash') },
        warning: { DEFAULT: withAlpha('--color-warning'), wash: withAlpha('--color-warning-wash') },
        danger: { DEFAULT: withAlpha('--color-danger'), wash: withAlpha('--color-danger-wash') },
        info: { DEFAULT: withAlpha('--color-info'), wash: withAlpha('--color-info-wash') },
        live: withAlpha('--color-live'),
        category,
      },

      // 4pt grid. These are the named additions beyond Tailwind's default scale.
      spacing: {
        4.5: '18px',
        13: '52px',
        15: '60px',
        18: '72px',
        22: '88px',
        gutter: '16px',
      },

      /*
       * Generous radii are central to this direction — a glass panel with tight
       * corners reads as a dialog box, not a floating surface. `xl` (28px) is
       * the sheet/panel radius; `lg` (20px) is cards and buttons.
       */
      borderRadius: {
        xs: '10px',
        sm: '14px',
        DEFAULT: '16px',
        md: '16px',
        lg: '20px',
        xl: '28px',
        '2xl': '36px',
        pill: '999px',
      },

      /*
       * React Native cannot synthesise weights from one custom family on
       * Android — fontWeight only selects a face the OS knows about. So each
       * weight is its own registered family, exposed as a distinct utility.
       * Names avoid Tailwind's own font-weight utilities to prevent collisions.
       */
      fontFamily: {
        sans: ['Inter_400Regular', 'system-ui', 'sans-serif'],
        'sans-medium': ['Inter_500Medium', 'system-ui', 'sans-serif'],
        'sans-semibold': ['Inter_600SemiBold', 'system-ui', 'sans-serif'],
        'sans-bold': ['Inter_700Bold', 'system-ui', 'sans-serif'],
        display: ['Inter_800ExtraBold', 'system-ui', 'sans-serif'],
      },

      /*
       * Tight, confident type. Display sizes carry heavy negative tracking —
       * the modern look depends on headlines that feel compressed, and on
       * overlay text over video being large enough to read at a glance.
       */
      fontSize: {
        'display-xl': ['44px', { lineHeight: '44px', letterSpacing: '-1.6px' }],
        'display-lg': ['36px', { lineHeight: '38px', letterSpacing: '-1.2px' }],
        'display-md': ['28px', { lineHeight: '32px', letterSpacing: '-0.8px' }],
        'title-lg': ['22px', { lineHeight: '28px', letterSpacing: '-0.5px' }],
        'title-md': ['18px', { lineHeight: '24px', letterSpacing: '-0.3px' }],
        'title-sm': ['16px', { lineHeight: '22px', letterSpacing: '-0.2px' }],
        'body-lg': ['16px', { lineHeight: '24px', letterSpacing: '-0.1px' }],
        body: ['15px', { lineHeight: '22px', letterSpacing: '-0.1px' }],
        'body-sm': ['13px', { lineHeight: '19px' }],
        label: ['12px', { lineHeight: '15px', letterSpacing: '0.4px' }],
        caption: ['11px', { lineHeight: '14px', letterSpacing: '0.2px' }],
      },
    },
  },
  plugins: [],
};
