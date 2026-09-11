import fs from 'fs';
import path from 'path';
import { colors, lightColors, useColors } from '@/lib/theme';

/**
 * The app has one appearance and cannot be talked out of it.
 *
 * A dark/light switch shipped here and produced an app that came up dark for
 * a reader who had never chosen dark. The cause was not one bug: a stored
 * preference, the OS scheme and an in-app default each independently decided
 * the question, so fixing one only moved the failure to another.
 *
 * The switch is gone. These tests exist because "gone" is the kind of thing
 * that comes back one plausible commit at a time — a `dark:` class here, a
 * second palette there — and none of it is a type error.
 */

const ROOT = path.resolve(__dirname, '../../..');
const css = fs.readFileSync(path.join(ROOT, 'global.css'), 'utf8');

test('the tokens live in one plain :root block, with no dark counterpart', () => {
  /*
   * An earlier version of this test required the opposite — a grouped
   * `:root, .dark:root, .dark` selector — on a guess about how NativeWind
   * extracts variables. The guess was wrong (it extracts them either way), so
   * the test was pinning a shape nobody needed while the real fault, an
   * unbalanced brace left behind by the same edit, went unnoticed.
   *
   * What matters is only that there is one block and no dark one. Whether it
   * parses and what the runtime receives is `compiledTokens.test.ts`, which
   * compiles instead of reading and is the check with teeth.
   */
  // Comments go first: the header prose discusses `.dark` by name, and a check
  // that cannot tell an explanation from a rule would either fail on the
  // documentation or force it to go unwritten.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  expect(rules).toMatch(/@layer base \{\s*:root \{/);
  expect(rules).not.toMatch(/\.dark/);
});

test('no component opts into a dark variant', () => {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !full.includes('__tests__')) files.push(full);
    }
  })(path.join(ROOT, 'src'));

  // `dark:` in a className is dead styling now. Flagging it keeps someone from
  // adding half a theme and wondering why it never appears.
  const offenders = files.filter((f) =>
    /className=\{?["'`][^"'`]*\bdark:/.test(fs.readFileSync(f, 'utf8')),
  );
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});

test('the palette hooks have one answer', () => {
  expect(useColors()).toBe(lightColors);
  expect(colors).toBe(lightColors);
});

test('nothing picks brand artwork by asking the theme', () => {
  // Reversed artwork is now requested by the surface that needs it — the
  // masthead — rather than inferred. A hook that answers "is it dark" would
  // always say no, which reads to the next person like a live question with a
  // current answer instead of one the app no longer has.
  const brand = fs.readFileSync(path.join(ROOT, 'src/components/Brand.tsx'), 'utf8');
  expect(brand).not.toMatch(/useIsDark|useColorScheme/);
  expect(brand).toMatch(/reversed/);
});

test('the masthead is black and the news ground is white', () => {
  // The thing that was actually asked for, pinned so a token rename cannot
  // quietly undo it.
  expect(lightColors.masthead.toLowerCase()).toBe('#1a1a1d');
  expect(lightColors.canvasSoft.toLowerCase()).toBe('#ffffff');
});

test('there is no theme store to hydrate', () => {
  expect(fs.existsSync(path.join(ROOT, 'src/stores/themeStore.ts'))).toBe(false);
});

test('screens with a dark ground ask for light status-bar icons', () => {
  /*
   * The app-wide default is `style="dark"`, which is right for a white page
   * and wrong everywhere the app is still dark: the masthead runs up behind
   * the clock, and the camera, detail and slides views are full-screen black.
   * Dark icons on those are invisible rather than merely wrong, and nothing
   * about it is a type error.
   *
   * Found by scanning for the container class, not by listing screen names. A
   * hardcoded list only covers what someone remembered to add — the camera
   * screen was missing from the first version of this test for exactly that
   * reason, and a list cannot tell you what it has left out.
   *
   * Only a *full-screen* dark root counts. A dark overlay inside a light page
   * — a caption bar over a photo, a scrim on a thumbnail — leaves the top of
   * the screen white, so those correctly keep the dark icons.
   */
  const DARK_ROOT = /className="(flex-1 bg-black|bg-masthead)"/;

  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.tsx')) files.push(full);
    }
  })(path.join(ROOT, 'src/features'));

  const darkScreens = files.filter((f) => DARK_ROOT.test(fs.readFileSync(f, 'utf8')));

  // If this drops to nothing the scan has stopped finding anything and the
  // rest of the test would pass by being vacuous.
  expect(darkScreens.length).toBeGreaterThanOrEqual(4);

  const missing = darkScreens
    .filter((f) => !/<StatusBar style="light"/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));

  expect(missing).toEqual([]);
});
