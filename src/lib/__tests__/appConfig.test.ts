import fs from 'fs';
import path from 'path';
import { darkColors } from '@/lib/theme';

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

test('the interface style does not force light', () => {
  // `light` makes the OS report a light scheme, which NativeWind honours over
  // anything the app sets — dark mode simply does nothing.
  expect(app.userInterfaceStyle).not.toBe('light');
});

test('the splash is painted the dark ground, not white', () => {
  expect(app.splash.backgroundColor.toLowerCase()).toBe(darkColors.canvas.toLowerCase());
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

test('the splash artwork is the reversed lockup', () => {
  // Generated from gna-digital-platform-reversed.png. The standard lockup is
  // black type and would vanish against the dark ground.
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
