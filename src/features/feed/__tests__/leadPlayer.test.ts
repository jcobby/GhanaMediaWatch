import fs from 'fs';
import path from 'path';

/**
 * The top stories must survive changing desk.
 *
 * Tapping "Africa" remounted the top stories, the native video player was
 * released as the slide unmounted, and the effect cleanup then called
 * `player.pause()` on it: "Calling the 'pause' function has failed … Unable to
 * find the native shared object". A render error took the whole feed down.
 */

const code = fs
  .readFileSync(path.resolve(__dirname, '..', 'FeedLead.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('every call on the native player is guarded', () => {
  // Every pause goes through `safely`, and so does the play.
  const pauses = code.match(/player\.pause\(\)/g) ?? [];
  const guardedPauses = code.match(/safely\(\(\) => player\.pause\(\)\)/g) ?? [];
  expect(pauses.length).toBeGreaterThan(0);
  expect(guardedPauses.length).toBe(pauses.length);
  expect(code).toMatch(/safely\(\(\) => \{\s*player\.currentTime = 0;\s*player\.play\(\);\s*\}\)/);
  expect((code.match(/player\.play\(\)/g) ?? []).length).toBe(1);
  expect(code).toMatch(/function safely<T>\(call: \(\) => T\): T \| undefined \{\s*try \{/);
});

test('a clip that has not started shows that it is loading', () => {
  expect(code).toMatch(/player\.addListener\('statusChange'/);
  expect(code).toMatch(/source && waiting \? \(/);
  expect(code).toMatch(/<ActivityIndicator/);
  // A clip that fails stops the spinner rather than spinning forever.
  expect(code).toMatch(/status === 'error'\) setWaiting\(false\)/);
});
