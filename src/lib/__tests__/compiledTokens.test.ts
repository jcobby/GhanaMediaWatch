import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { cssToReactNativeRuntime } from 'react-native-css-interop/css-to-rn';
import { lightColors } from '@/lib/theme';

/**
 * The design tokens, checked through the pipeline that actually renders them.
 *
 * Every other test here reads global.css as text, and text-matching missed two
 * separate ways the whole token set can vanish at once:
 *
 * 1. **An unbalanced brace.** A stray `}` makes the stylesheet fail to parse.
 *    Metro does not stop for it, so the app boots with no tokens at all.
 *
 * 2. **A grouped selector.** NativeWind extracts variables by recognising
 *    specific block forms. Written as `:root, .dark:root, .dark { … }` the
 *    block is skipped silently — valid CSS, zero tokens.
 *
 * Both shipped. The symptom is the same and is not subtle: `bg-masthead`
 * resolves to nothing, so the black header renders transparent and the white
 * labels on it land on the white page and disappear.
 *
 * So this compiles global.css with the real Tailwind config and runs the
 * result through NativeWind's own parser. It is the only check here that would
 * have caught either bug, because it asks what the app receives rather than
 * what the file looks like.
 */

const ROOT = path.resolve(__dirname, '../../..');

/** RGB channels as NativeWind resolves them, e.g. `#1A1A1D` -> [26, 26, 29]. */
function channels(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

type Runtime = {
  rootVariables?: Record<string, Record<string, unknown>>;
  rules?: Record<string, unknown>;
};

let runtime: Runtime;
let compiledCss: string;

beforeAll(async () => {
  const css = fs.readFileSync(path.join(ROOT, 'global.css'), 'utf8');
  // Throws on a syntax error, which is the point — a broken stylesheet must
  // fail the suite rather than reach a device.
  // The project's own config, loaded by path rather than imported, so this
  // compiles exactly what the app compiles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require(path.join(ROOT, 'tailwind.config.js'));
  const built = await postcss([tailwind({ ...config })]).process(css, {
    from: path.join(ROOT, 'global.css'),
  });

  compiledCss = built.css;
  runtime = cssToReactNativeRuntime(built.css) as Runtime;
}, 60_000);

test('every colour token reaches the runtime', () => {
  const vars = runtime.rootVariables ?? {};
  // 25 tokens, not "some" — a block that fails to parse yields zero, and a
  // partial extraction is just as broken as none.
  expect(Object.keys(vars).length).toBeGreaterThanOrEqual(25);
});

test('the masthead is black and the news ground is white, as compiled', () => {
  const vars = runtime.rootVariables ?? {};
  // The two the request turns on, read from the compiled output rather than
  // from the palette that feeds it.
  expect(vars['--color-masthead']).toEqual({ light: channels(lightColors.masthead) });
  expect(vars['--color-canvas-soft']).toEqual({ light: channels(lightColors.canvasSoft) });
});

test('no dark rule survives into the compiled stylesheet', () => {
  // Checked on the compiled CSS rather than on the runtime object: with
  // `darkMode: 'class'` and nothing setting that class, NativeWind quietly
  // drops a `.dark` block instead of recording a dark value for it. So the
  // runtime looks identical either way, and only the stylesheet shows that
  // half a theme has been added back.
  const rules = compiledCss.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(rules).not.toMatch(/\.dark[\s,{:]/);
});

test('the masthead utility compiles to a background colour', () => {
  const rules = runtime.rules ?? {};
  // The class the header actually uses. Present in the stylesheet is not the
  // same as present in the runtime, and only the second one paints.
  expect(rules['bg-masthead']).toBeDefined();
  expect(JSON.stringify(rules['bg-masthead'])).toContain('--color-masthead');
});

test('every opacity modifier used in the app actually compiles', () => {
  /*
   * `bg-white/12` produces no CSS.
   *
   * Tailwind's opacity scale is 0, 5, 10, 20, 25, … — 12 is not on it, and an
   * off-scale value needs bracket syntax (`/[0.12]`) to be generated at all.
   * Written plain it is not an error: the class is emitted into the element,
   * matches no rule, and the background simply never paints. Two shipped that
   * way — the Slides pill in the masthead and a divider in the feed both had
   * no background for as long as they had existed.
   *
   * This compares what the source asks for against what the stylesheet
   * defines, so any future off-scale value fails here instead of quietly
   * rendering nothing.
   */
  const defined = new Set<string>();
  const SELECTOR = new RegExp(String.raw`\.((?:[A-Za-z0-9_-]|\\.)+)`, 'g');
  const ESCAPE = new RegExp(String.raw`\\(.)`, 'g');

  for (const m of compiledCss.matchAll(SELECTOR)) {
    // CSS escapes the slash, so `.bg-white\/15` must be unescaped first.
    defined.add(m[1]!.replace(ESCAPE, '$1'));
  }

  const used = new Map<string, string>();
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(e.name) && !f.includes('__tests__')) {
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(/className=\{?["'`]([^"'`]*)["'`]/g)) {
          for (const cls of m[1]!.split(/\s+/)) {
            if (/^[a-z-]+\/[0-9]+$/.test(cls) && !used.has(cls)) used.set(cls, f);
          }
        }
      }
    }
  })(path.join(ROOT, 'src'));

  // If this finds nothing the scan has broken and the check below is vacuous.
  expect(used.size).toBeGreaterThan(10);

  const missing = [...used]
    .filter(([cls]) => !defined.has(cls))
    .map(([cls, file]) => `${cls} (${path.relative(ROOT, file)})`);

  expect(missing).toEqual([]);
});
