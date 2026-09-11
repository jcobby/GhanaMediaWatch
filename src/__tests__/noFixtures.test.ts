import fs from 'fs';
import path from 'path';

/**
 * No screen invents its own data.
 *
 * The app shipped nineteen files reading seeded constants, and the damage was
 * not cosmetic. The destination picker offered organisations that are not on
 * the platform, so a reporter chose two agencies and the report went nowhere.
 * The map put floods at coordinates nothing had been filed at. The surveys
 * list let somebody answer five questions for a reward nobody would pay. Sign-in
 * decided the *account type* from a hardcoded email list, granting the platform
 * console on the strength of a fixture.
 *
 * An empty screen that explains itself is always better than a full one that is
 * invented, so the fixtures are confined to the mock client and the tests.
 */

const SRC = path.resolve(__dirname, '..');

/** The seeded data — as opposed to category labels, role metadata and the like. */
const FIXTURES = [
  'SAMPLE_INCIDENTS',
  'ORGANISATIONS',
  'SURVEYS',
  'MY_REPORTS',
  'EARNINGS_SUMMARY',
  'COMMISSION_LEDGER',
  'OUTBOX_ITEMS',
  'PLATFORM_OWNERS',
  'DEMO_LOGINS',
  'ROUTING_QUEUE',
  'EDITORIAL_CASES',
  'INTERNAL_SUBMISSIONS',
  'MEMBERSHIP_REQUESTS',
];

const FIXTURE_MODULES = /@\/api\/(mockData|dawuroData|fixtures|commentsData|outcomeData)/;

/**
 * Where seeded data is legitimate.
 *
 * `src/api/mock.ts` is the fixture client itself — its whole job is to serve
 * them when no backend is configured. The demo sheet is rendered only when
 * `isLiveBackend` is false, and exists so the three experiences can be reached
 * without a server.
 */
const ALLOWED = [
  'api/mock.ts',
  'api/mockData.ts',
  'api/dawuroData.ts',
  'api/fixtures.ts',
  'api/commentsData.ts',
  'api/outcomeData.ts',
  'features/auth/DemoAccountSheet.tsx',
];

/**
 * Surfaces nobody can currently reach.
 *
 * The organisation and platform screens on the phone are dead: the
 * organisation tier is behind a flag that is off, the platform screens need an
 * `accountType` of `platform_owner` which nothing can now produce, and the org
 * screens have no entry point at all. The spec puts both roles in the console
 * anyway — "Console only" — so these are a mobile surface for a job that is not
 * done on mobile.
 *
 * They keep their fixtures rather than being wired against endpoints nobody
 * can exercise. `unreachable surfaces stay unreachable` below is what makes
 * that safe: the moment one becomes reachable, this exemption has to go with
 * it.
 */
const UNREACHABLE = ['features/organisation/', 'features/org/', 'features/platform/'];

function sourceFiles(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  })(SRC);
  return out;
}

const rel = (file: string) => path.relative(SRC, file).replace(/\\/g, '/');

test('the sweep finds the app', () => {
  // Otherwise every rule below passes by scanning nothing.
  expect(sourceFiles().length).toBeGreaterThan(80);
});

test('no screen imports seeded data', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const name = rel(file);
    if (ALLOWED.includes(name)) continue;
    if (UNREACHABLE.some((prefix) => name.startsWith(prefix))) continue;

    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(
      new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*['"]${FIXTURE_MODULES.source}['"]`, 'gs'),
    )) {
      const names = match[1]!.split(',').map((n) => n.trim().replace(/^type\s+/, ''));
      const seeded = names.filter((n) => FIXTURES.includes(n));
      if (seeded.length) offenders.push(`${name} — ${seeded.join(', ')}`);
    }
  }

  expect(offenders).toEqual([]);
});

test('the allow-list is not a way to smuggle fixtures back in', () => {
  /*
   * Every allowed file must actually exist. A stale entry is a hole: rename a
   * screen to a path on this list and the rule stops applying to it.
   */
  for (const name of ALLOWED) {
    expect([name, fs.existsSync(path.join(SRC, name))]).toEqual([name, true]);
  }
});

test('the demo shortcut is only offered without a backend', () => {
  /*
   * A one-tap route into an organisation or operator account must not exist against
   * a real server. The sheet itself is allowed to read seeded logins; what
   * matters is that nothing renders it when a backend is configured.
   */
  const signIn = fs.readFileSync(path.join(SRC, 'features/auth/SignInScreen.tsx'), 'utf8');
  expect(signIn).toMatch(/\{!isLiveBackend \?/);
});

test('sign-in does not decide the account type from a fixture', () => {
  /*
   * The worst of the nineteen. `findDemoLogin(email)` granted whatever the
   * seeded list said — so a hardcoded address handed the phone an organisation or
   * platform-operator experience, decided entirely on the device. The password
   * was checked upstream; the *role* was not.
   */
  const store = fs.readFileSync(path.join(SRC, 'stores/authStore.ts'), 'utf8');
  expect(store).not.toMatch(/findDemoLogin|PLATFORM_OWNERS|DEMO_PASSWORD/);
  // It asks the server instead.
  expect(store).toMatch(/describeOrg\(\)/);
});

test('nothing grants the platform console client-side', () => {
  /*
   * `signInAsPlatformOwner` matched a seeded email and access code and set
   * `accountType: 'platform_owner'` without calling the server at all. It had
   * no callers, which made it easy to miss and no less dangerous.
   */
  const store = fs.readFileSync(path.join(SRC, 'stores/authStore.ts'), 'utf8');
  expect(store).not.toMatch(/signInAsPlatformOwner/);
  expect(store).not.toMatch(/accountType: 'platform_owner'/);
});

test('an organisation account is never minted on the phone', () => {
  /*
   * The organisation sign-up minted a local organisation id and signed the
   * applicant into an account the server had never heard of.
   *
   * Asserted on the call rather than on the id, because the comment explaining
   * the old behaviour quotes it — searching the whole file for the literal
   * matches the explanation and fails on correct code.
   */
  const signUp = fs.readFileSync(
    path.join(SRC, 'features/organisation/OrganisationSignUpScreen.tsx'),
    'utf8',
  );
  expect(signUp).not.toMatch(/await signInAsOrganisation\(/);
});

test('unreachable surfaces stay unreachable', () => {
  /*
   * What makes the exemption above safe. These screens still read seeded data,
   * which is only acceptable while nobody can open them.
   */
  const entry = fs.readFileSync(path.join(SRC, 'app/index.tsx'), 'utf8');
  const profile = fs.readFileSync(path.join(SRC, 'features/profile/ProfileScreen.tsx'), 'utf8');
  const features = fs.readFileSync(path.join(SRC, 'lib/features.ts'), 'utf8');

  // The organisation tier is off.
  expect(features).toMatch(/ORGANISATION_TIER_ENABLED = false/);
  // Both entry points into the organisation shell are gated on that flag.
  expect(entry).toMatch(/ORGANISATION_TIER_ENABLED && accountType === 'organisation'/);
  expect(profile).toMatch(/ORGANISATION_TIER_ENABLED && profile\?\.accountType === 'organisation'/);
  // And nothing can produce a platform_owner any more.
  const store = fs.readFileSync(path.join(SRC, 'stores/authStore.ts'), 'utf8');
  expect(store).not.toMatch(/accountType: 'platform_owner'/);
});
