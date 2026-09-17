import fs from 'fs';
import path from 'path';

/**
 * Organisation and platform work lives in the web console, not on the phone.
 *
 * The phone carried a platform console (routing, payouts, applications,
 * organisations), an org dashboard with saved queries, an organisation inbox
 * and published archive, and a survey builder — all reading sample data, and
 * none of them reachable: the organisation tier was behind a flag that was off,
 * nothing could produce a platform owner, and the org screens had no entry
 * point. The console does all of that work against the real service.
 *
 * They were removed rather than kept behind a flag. These rules keep them from
 * coming back half-wired.
 */

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the organisation and platform screens are gone', () => {
  for (const dir of [
    'features/platform',
    'features/org',
    'features/organisation',
    'app/platform',
    'app/org',
    'app/organisation',
    'lib/features.ts',
    'app/surveys/new.tsx',
  ]) {
    expect([dir, fs.existsSync(path.join(SRC, dir))]).toEqual([dir, false]);
  }
});

test('nothing on the phone routes into them', () => {
  const offenders: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const src = code(path.relative(SRC, full));
        // `/organisations` — the public directory — is a reader feature and stays.
        if (/['"`]\/(platform|org|organisation)(\/|['"`(])/.test(src)) {
          offenders.push(path.relative(SRC, full).replace(/\\/g, '/'));
        }
      }
    }
  })(SRC);
  expect(offenders).toEqual([]);
});

test('every account lands in the reporter app', () => {
  expect(code('app/index.tsx')).toMatch(/router\.replace\(onboarded \? '\/\(tabs\)'/);
  expect(code('features/auth/SignInScreen.tsx')).toMatch(/router\.replace\('\/\(tabs\)'\)/);
  expect(code('stores/authStore.ts')).not.toMatch(/signInAsOrganisation/);
});

test('the public organisation directory stays', () => {
  expect(fs.existsSync(path.join(SRC, 'features/organisations'))).toBe(true);
  expect(code('features/feed/FeedScreen.tsx')).toMatch(/\/organisations/);
});
