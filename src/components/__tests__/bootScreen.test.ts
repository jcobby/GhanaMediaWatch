import fs from 'fs';
import path from 'path';
import { lightColors } from '@/lib/theme';

/**
 * The first screen of the app says what the app is.
 *
 * **What it looked like before.** A wordmark floating alone in the middle of an
 * empty page, and — pinned to the very bottom edge, a hand's width away — the
 * drum mark with the two credits under it. Two unrelated things at opposite
 * ends of a blank field, with nothing tying them together, which is why it read
 * as a page that had failed to finish loading rather than as a launch screen.
 *
 * It also put the app's own mark directly above "Sponsored by the Ghana News
 * Agency", so Dawuro's logo read as part of the agency's credit rather than as
 * the product's own.
 *
 * Now it is one centred stack in the order the introduction uses — mark, name,
 * credit — with the mark in a rounded tile, the shape every launcher and app
 * switcher draws around an icon. That shape is the whole reason it reads as
 * *this application starting* instead of as an illustration on a page.
 *
 * Source-read, because what is being checked is composition — what sits inside
 * what, and in which order — and that is exactly what the file shows. Mounting
 * it would prove the tree renders, which was never in doubt.
 */

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const BOOT = read('components/BootScreen.tsx');
/** Prose describing the old layout must not read as the old layout. */
const code = BOOT.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the file under review was read', () => {
  expect(BOOT.length).toBeGreaterThan(1500);
});

test('the tile holds the whole identity — agency lockup above, app name below', () => {
  /*
   * Both inside the tile, and that is the point.
   *
   * The agency's lockup fills it, so without the name in there too the launch
   * screen would never say what the reader actually installed — the fault this
   * component was rebuilt to fix. Captioning it just underneath is not the
   * same thing: a word sitting below a box reads as a label for a picture
   * rather than as the name of the product, which is how the very first
   * version of this screen went wrong.
   */
  const tile = code.indexOf('borderRadius');
  const lockup = code.indexOf('<GnaLockup');
  const name = code.indexOf('<DawuroWordmark');
  const closesTile = code.indexOf('</View>', name);
  const credit = code.indexOf('<ProvidedBy');

  expect(tile).toBeGreaterThan(0);
  expect(lockup).toBeGreaterThan(tile);
  expect(name).toBeGreaterThan(lockup);
  // Both are inside: the tile's closing tag comes after them, the credit after that.
  expect(closesTile).toBeGreaterThan(name);
  expect(credit).toBeGreaterThan(closesTile);

  // Both scale with the tile, so it stays one object at any size.
  expect(code).toMatch(/<GnaLockup height=\{Math\.round\(TILE \* 0\.\d+\)\}/);
  expect(code).toMatch(/<DawuroWordmark size=\{Math\.round\(TILE \* 0\.\d+\)\}/);
});

test('the agency is credited once, not twice on one screen', () => {
  /*
   * The sponsor line is deliberately not rendered here.
   *
   * GNA's full lockup is the largest thing on this screen, inside the app
   * tile. "Sponsored by" beneath it, with the same mark at a third of the
   * size, credited one organisation twice in a single glance — and the smaller
   * one only made the larger look less deliberate. What remains is the build
   * credit.
   *
   * The introduction still shows both, which is why this is a prop rather than
   * a deletion; `ProvidedBy` switches its accessibility label to match, so a
   * screen reader is never told about a credit that is not drawn.
   */
  expect(code).toMatch(/credits="poweredBy"/);

  const brand = read('components/Brand.tsx');
  expect(brand).toMatch(/credits\?: 'both' \| 'poweredBy'/);
  expect(brand).toMatch(/credits === 'both' \? \(/);
  expect(brand).toMatch(/credits === 'both'\s*\?\s*`\$\{t\('app\.sponsoredBy'\)\}/);

  // The introduction is the screen that keeps both, and must not be switched.
  expect(read('features/auth/OnboardingScreen.tsx')).not.toMatch(/credits=/);
});

test('the build credit sits at the foot, clear of the home indicator', () => {
  /*
   * **This reverses an earlier rule, and the reason it reversed matters.**
   *
   * A credit was once pinned to the bottom of this screen while the only other
   * thing on it was a wordmark floating in the middle of an empty page — two
   * unrelated objects at opposite ends of nothing, which is why the rule then
   * was that nothing may be pinned to the bottom. The tile changed that: a
   * finished object holds the centre on its own, and a single line of build
   * credit at the foot is a footer rather than an orphan.
   *
   * Absolute rather than spaced off the group, because the group is centred as
   * a whole — every point of margin under it lifts the tile off centre by half
   * as much.
   */
  expect(code).toMatch(/position: 'absolute'[\s\S]{0,60}bottom: FOOT/);

  /*
   * A constant, not `useSafeAreaInsets()`. `_layout.tsx` returns this
   * component *before* it mounts `SafeAreaProvider`, so the hook has no
   * provider to read and would throw on the one screen that must never fail.
   */
  expect(code).toMatch(/const FOOT = \d+/);
  expect(code).not.toMatch(/useSafeAreaInsets/);
  const layout = read('app/_layout.tsx');
  expect(layout.indexOf('<BootScreen />')).toBeLessThan(layout.indexOf('<SafeAreaProvider>'));

  // Enough to clear a home indicator rather than sit on it.
  const foot = /const FOOT = (\d+)/.exec(code);
  expect(Number(foot![1])).toBeGreaterThanOrEqual(40);
});

test('the agency lockup is cropped artwork, not the padded square', () => {
  /*
   * `assets/splash-icon.png` is 1024 square with about a fifth of its height
   * in dead margin, because it is built to be a native splash image. Sizing a
   * component against that is how a logo ends up looking small inside a box
   * that is the right size, so the brand asset is cropped to its ink.
   */
  const brand = read('components/Brand.tsx');
  expect(brand).toMatch(/gna-lockup\.png/);
  expect(brand).toMatch(/width: height \* 0\.84/);
  expect(fs.existsSync(path.resolve(SRC, '../assets/brand/gna-lockup.png'))).toBe(true);
});

test('the credit is not also spaced off the centred group', () => {
  /*
   * It is positioned against the screen now, so a `marginTop` on it would be
   * two conflicting ways of placing one element — and the margin would win in
   * the layout while reading as dead code.
   */
  expect(code).not.toMatch(/<ProvidedBy[^>]*marginTop/);
});

test('the tile is a rounded, shadowed square that scales as one object', () => {
  /*
   * All four shadow properties, because iOS needs every one of them and a
   * missing `shadowOpacity` silently draws nothing — plus `elevation`, which
   * is the only one Android reads.
   */
  expect(code).toMatch(/const TILE = \d+/);
  expect(code).toMatch(/width: TILE/);
  expect(code).toMatch(/height: TILE/);
  expect(code).toMatch(/borderRadius: Math\.round\(TILE \* 0\.23\)/);
  expect(code).toMatch(/shadowColor:/);
  expect(code).toMatch(/shadowOpacity:/);
  expect(code).toMatch(/shadowOffset:/);
  expect(code).toMatch(/elevation:/);

  /*
   * And it is wide enough to be the tile's only edge.
   *
   * **This bound was the other way round, and the page changed underneath it.**
   * When the ground was #F4F5FA the tile had contrast of its own and a tight
   * blur was right; a wide one spread into grey fog. The page is white now, so
   * the tile has no border and no contrast at all — remove the shadow and
   * there is no box, only a logo on a page. The shadow stopped being a hint
   * and became the edge.
   *
   * The drop stays small against that spread: a large blur thrown far down
   * reads as an object floating well above the page, which is not what an app
   * tile does.
   */
  const blur = /shadowRadius: (\d+)/.exec(code);
  const drop = /shadowOffset: \{ width: 0, height: (\d+) \}/.exec(code);
  const alpha = /shadowOpacity: ([\d.]+)/.exec(code);
  expect(blur).not.toBeNull();
  expect(drop).not.toBeNull();
  expect(alpha).not.toBeNull();
  expect(Number(blur![1])).toBeGreaterThanOrEqual(20);
  expect(Number(alpha![1])).toBeGreaterThanOrEqual(0.12);
  expect(Number(drop![1])).toBeLessThan(Number(blur![1]) / 2);

  /*
   * Inline rather than through a class. A radius this size has never been used
   * elsewhere in `src`, and NativeWind builds its stylesheet from the class
   * names present when Metro boots — so `rounded-[38px]` would compile to no
   * rule at all and the tile would render as a hard-edged square, with no
   * error anywhere. The same trap already shipped twice on this project.
   */
  expect(code).not.toMatch(/rounded-\[/);
});

test('the ground still matches the native splash exactly', () => {
  /*
   * The one hard constraint on this screen's background.
   *
   * The native splash is painted by the OS before any JavaScript runs, and
   * this component takes over from it. If the two grounds differ by even a
   * shade, the handover shows as a flash of a slightly different page — and it
   * is the most-seen frame in the app, since every launch passes through it.
   *
   * So the colour is asserted on both sides rather than trusted. Moving this
   * screen to white meant moving `app.json` with it, in both places that
   * declare the ground: the window colour and the splash plugin's own.
   */
  expect(code).toMatch(/backgroundColor: c\.canvasSoft\b/);

  const app = JSON.parse(read('../app.json'));
  const splash = app.expo.plugins.find(
    (p: unknown): p is [string, { backgroundColor: string }] =>
      Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  expect(splash?.[1].backgroundColor).toBe('#FFFFFF');
  expect(app.expo.splash.backgroundColor).toBe('#FFFFFF');
  expect(app.expo.backgroundColor).toBe('#FFFFFF');

  // And `canvasSoft` is what that hex actually is, so the two cannot drift.
  expect(lightColors.canvasSoft.toUpperCase()).toBe('#FFFFFF');

  /*
   * The launcher icon's ground is deliberately *not* swept along. That is the
   * tile on the home screen, a different surface on a wallpaper nobody here
   * controls, and changing the app's icon was not part of making this screen
   * white.
   */
  expect(app.expo.android.adaptiveIcon.backgroundColor).toBe('#F4F5FA');
});
