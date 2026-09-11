import fs from 'fs';
import path from 'path';

/**
 * Every `<Stack.Screen name>` names a route that exists.
 *
 * Expo Router builds the child route names from the filesystem, and a folder
 * only collapses into a single name when it has its own `_layout`. Without one,
 * `organisations/` is not a route — `organisations/index` and `organisations/[id]` are.
 *
 * Declaring the folder anyway produces this at startup:
 *
 *   WARN [Layout children]: No route named "organisations" exists in nested
 *   children: [… "organisations/[id]", "organisations/index" …]
 *
 * And then nothing else happens. The screen still opens, because the router
 * falls back to the route it inferred, so the only symptom is a line in a log
 * nobody reads — while any `options` attached to that declaration (a
 * presentation mode, a header, an animation) are silently dropped.
 *
 * Two were wrong: `organisations` and `earnings`. `incident/[id]` and
 * `capture/review` were already right, which is what made the mistake easy to
 * miss — the file had both spellings in it.
 */

const APP = path.resolve(__dirname, '..');

/** Route names as Expo Router derives them from the filesystem. */
function routeNames(): string[] {
  const names: string[] = [];

  for (const entry of fs.readdirSync(APP, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name === '__tests__') continue;

    if (entry.isDirectory()) {
      const dir = path.join(APP, entry.name);
      // A folder with its own layout is one route; without one, each file is.
      if (fs.existsSync(path.join(dir, '_layout.tsx'))) {
        names.push(entry.name);
        continue;
      }
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.tsx') || file.startsWith('_')) continue;
        names.push(`${entry.name}/${file.replace(/\.tsx$/, '')}`);
      }
      continue;
    }

    if (entry.name.endsWith('.tsx')) names.push(entry.name.replace(/\.tsx$/, ''));
  }

  return names;
}

const declared = [
  ...fs
    .readFileSync(path.join(APP, '_layout.tsx'), 'utf8')
    .matchAll(/<Stack\.Screen\s+name="([^"]+)"/g),
].map((m) => m[1]!);

test('the scan finds both lists', () => {
  // Neither may be empty, or the comparison below proves nothing.
  expect(declared.length).toBeGreaterThan(5);
  expect(routeNames().length).toBeGreaterThan(5);
});

test('every declared screen is a real route', () => {
  const real = routeNames();
  const missing = declared.filter((name) => !real.includes(name));
  expect(missing).toEqual([]);
});

test('a folder without a layout is declared file by file', () => {
  /*
   * The specific shape of the bug, so a regression is legible rather than
   * appearing as a generic mismatch: naming the bare folder is the wrong move
   * whenever that folder has no `_layout`.
   */
  const bareFolders = fs
    .readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && e.name !== '__tests__')
    .filter((e) => !fs.existsSync(path.join(APP, e.name, '_layout.tsx')))
    .map((e) => e.name);

  const wronglyDeclared = bareFolders.filter((folder) => declared.includes(folder));
  expect(wronglyDeclared).toEqual([]);
});
