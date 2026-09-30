import fs from 'fs';
import path from 'path';
import { lightColors } from '@/lib/theme';

/**
 * Launch configuration that typecheck cannot see.
 *
 * All three of these shipped broken at once and none of them is a type error:
 * the app forced a light interface style, the native splash was painted white
 * under a dark-default app, and the splash artwork was the black-text lockup
 * that would have been invisible on it.
 *
 * They are config, so only a test reaches them.
 */

const ROOT = path.resolve(__dirname, '../../..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;

test('the interface style is pinned light', () => {
  /*
   * This assertion used to read `not.toBe('light')`, back when the app had a
   * dark mode for the OS scheme to interfere with. It does not any more, and
   * the same mechanism now works for us: pinning the style means a phone in
   * night mode reports a light scheme to the app, so the OS cannot drag the
   * shell somewhere the reader never asked for.
   *
   * `automatic` here is what let the app come up dark on a dark phone.
   */
  expect(app.userInterfaceStyle).toBe('light');
});

test('every native ground is the ground the app launches into', () => {
  /*
   * Not "the splash is light" — that pins the test to a decision rather than
   * to a property. What must hold is that every colour the OS paints before
   * and around the JS matches the first frame the app paints, or the handover
   * flashes.
   *
   * `expo.backgroundColor` is the easy one to miss. It sits behind the root
   * view rather than in the splash, so it shows during rotation, in the
   * over-scroll gutter, and for the moment between splash teardown and first
   * render — the white flash that keeps being reported as "it went light".
   */
  /*
   * Read off `BootScreen` rather than named here.
   *
   * This pinned `lightColors.canvas` directly, which quietly turned a property
   * into a decision: the rule is "the native ground equals the first frame the
   * app paints", and naming one token asserts *which* token that frame uses.
   * When the launch screen moved to white — so the tile reads as a white card
   * on a white page — this failed for being out of date rather than for
   * anything being wrong, while still passing if someone changed the boot
   * screen's ground and left `app.json` behind, which is the actual bug.
   *
   * Resolving the token the component uses keeps the rule and drops the
   * decision, so the two can never drift in either direction.
   */
  const boot = fs.readFileSync(path.join(ROOT, 'src/components/BootScreen.tsx'), 'utf8');
  const token = /backgroundColor: c\.(\w+)/.exec(boot)?.[1] as keyof typeof lightColors;
  expect(token).toBeDefined();
  expect(lightColors[token]).toBeDefined();

  const ground = String(lightColors[token]).toLowerCase();
  expect(app.backgroundColor.toLowerCase()).toBe(ground);
  expect(app.splash.backgroundColor.toLowerCase()).toBe(ground);
});

test('the splash plugin agrees with the legacy splash key', () => {
  const plugin = app.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  expect(plugin).toBeDefined();
  // Two places define the splash and older tooling still reads the top-level
  // one. Disagreeing is how a white flash survives a fix.
  expect(plugin[1].backgroundColor.toLowerCase()).toBe(app.splash.backgroundColor.toLowerCase());
  expect(plugin[1].image).toBe(app.splash.image);
});

test('the splash artwork exists and is a lockup, not a mark', () => {
  // The standard, black-type lockup: it lands on a light ground. The full
  // lockup, not the mark — the wordmark is the identity.
  const file = path.join(ROOT, app.splash.image.replace('./', ''));
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.statSync(file).size).toBeGreaterThan(20_000);
});

test('the app is named Dawuro', () => {
  expect(app.name).toBe('Dawuro');
});

test('every asset app.json points at exists', () => {
  const refs = [
    app.icon,
    app.splash.image,
    app.web?.favicon,
    app.android?.adaptiveIcon?.foregroundImage,
    app.android?.adaptiveIcon?.monochromeImage,
  ].filter(Boolean) as string[];

  const missing = refs.filter((r) => !fs.existsSync(path.join(ROOT, r.replace('./', ''))));
  expect(missing).toEqual([]);
});
