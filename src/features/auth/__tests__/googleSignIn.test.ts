import fs from 'fs';
import path from 'path';
import appConfig from '../../../../app.json';

/**
 * Continuing with a Google account.
 *
 * Three things here can each break the app in a way no type or render test
 * catches: a config plugin that fails the build, a native import that crashes
 * launch, and a request that asks the service to trust an address nobody
 * proved.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SRC = path.join(ROOT, 'src');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the config plugin is absent, or complete', () => {
  /*
   * `@react-native-google-signin/google-signin`'s plugin **throws** without
   * `iosUrlScheme` — "Missing `iosUrlScheme` in provided options" — so a bare
   * entry, which is exactly what `npx expo install` adds, fails every
   * `expo prebuild` and every EAS build from that moment on.
   *
   * Either it is configured with the reversed iOS client id, or it is not there
   * at all. A half-added plugin is a broken build with no symptom until someone
   * tries to make one.
   */
  const plugins: unknown[] = appConfig.expo.plugins;
  const entry = plugins.find(
    (p) => (Array.isArray(p) ? p[0] : p) === '@react-native-google-signin/google-signin',
  );

  if (entry === undefined) return;

  expect(Array.isArray(entry)).toBe(true);
  const options = (entry as [string, { iosUrlScheme?: string }])[1];
  expect(typeof options?.iosUrlScheme).toBe('string');
  // The plugin checks this prefix too, and rejects anything else.
  expect(options.iosUrlScheme).toMatch(/^com\.googleusercontent\.apps\./);
});

test('the native module is never imported at launch', () => {
  /*
   * The library resolves its native module at *import* time —
   * `TurboModuleRegistry.getEnforcing`, which throws rather than returning null
   * — so a top-level import crashes the app anywhere the native side is
   * missing. That is Expo Go, and it is every jest run: adding the import took
   * the auth store's whole suite down, and the app boots through that store.
   *
   * Only `services/googleSignIn.ts` may name the package, and only through a
   * dynamic import inside a function.
   */
  const service = code('services/googleSignIn.ts');
  expect(service).toMatch(/await import\('@react-native-google-signin\/google-signin'\)/);
  expect(service).not.toMatch(/^import .*@react-native-google-signin/m);

  const offenders: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const rel = path.relative(SRC, full).replace(/\\/g, '/');
      if (rel === 'services/googleSignIn.ts') continue;
      if (/@react-native-google-signin/.test(fs.readFileSync(full, 'utf8'))) offenders.push(rel);
    }
  })(SRC);
  expect(offenders).toEqual([]);
});

test('the id token is the credential, and is always sent', () => {
  /*
   * `GoogleAuthRequest` marks every field optional, so a request carrying only
   * an email would ask the service to mint a session for an address nobody
   * proved — the same hole `POST /auth/signin` has, which nothing in this app
   * is allowed to use.
   */
  const service = code('services/googleSignIn.ts');
  expect(service).toMatch(/if \(!idToken\) throw new GoogleSignInUnavailable\('no_token'\)/);
  expect(code('api/http.ts')).toMatch(/idToken: input\.idToken/);
});

test('the client never names a role or an organisation', () => {
  /*
   * `kind` (which accepts `platform_owner`) and `orgId` are in the request
   * schema and must not be sent: a client that chooses those grants itself an
   * account type. What the account *is* comes back from `/me`, exactly as for a
   * password sign-in.
   */
  const http = code('api/http.ts');
  /*
   * Bounded by the next method, not by a comment — `code()` strips comments, so
   * slicing to one gives `indexOf` -1 and a "slice" that is the rest of the
   * file. That passed nothing and failed on `kind:` from an unrelated object
   * six hundred lines later.
   */
  const from = http.indexOf('async signInWithGoogle');
  const call = http.slice(from, http.indexOf('private async authenticate', from));
  expect(from).toBeGreaterThan(-1);
  expect(call).not.toMatch(/kind:/);
  expect(call).not.toMatch(/orgId/);
  expect(code('stores/authStore.ts')).toMatch(/const org = await describeOrg\(\)/);
});

test('a release build does not offer a button that cannot work', () => {
  /*
   * The client ids live in the environment and cannot be committed. Shipping a
   * picker that fails on an empty audience is a feature that lies — a reporter
   * cannot tell it from their account being refused.
   *
   * Development is the other half of that trade and it was got wrong first:
   * hiding it there too made the button invisible on the only device anyone was
   * looking at, with no way to tell "not built" from "not configured". So the
   * guard is `!isGoogleConfigured && !__DEV__`, and both halves matter.
   */
  const button = code('features/auth/GoogleButton.tsx');
  expect(button).toMatch(/if \(!isGoogleConfigured && !__DEV__\) return null;/);
  // And in development it says so on the screen, not only when pressed.
  expect(button).toMatch(/\{!isGoogleConfigured \? \(/);

  // The flag is the web client id, which is the audience the service checks.
  expect(code('services/googleSignIn.ts')).toMatch(
    /isGoogleConfigured = WEB_CLIENT_ID\.length > 0/,
  );
});

test('the env files name the variables the button needs', () => {
  /*
   * `.env.example` is the one that must always name them: it is tracked, and it
   * is what somebody cloning this repo copies.
   *
   * **`.env` is checked only if it is there.** It is gitignored
   * (`.gitignore:44`), so on a fresh clone or in CI it does not exist and
   * `readFileSync` threw — failing the entire Google suite for a reason that
   * has nothing to do with the button, on precisely the machines least able to
   * diagnose it. Where a developer does have one, a missing variable in it is
   * still worth catching: documented-and-absent is the same as not written down
   * at all.
   */
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  expect(example).toContain('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');

  const local = path.join(ROOT, '.env');
  if (fs.existsSync(local)) {
    expect(fs.readFileSync(local, 'utf8')).toContain('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  }
});

test('cancelling is not reported as a failure', () => {
  // A toast saying sign-in failed after somebody deliberately dismissed the
  // sheet is the app arguing with them.
  expect(code('services/googleSignIn.ts')).toMatch(/if \(!isSuccessResponse\(response\)\) return null/);
  expect(code('features/auth/GoogleButton.tsx')).toMatch(/if \(!signedIn\) return;/);
});

test('signing out forgets the Google session too', () => {
  /*
   * Otherwise the next tap silently re-uses the last Google account rather than
   * offering the picker, which on a shared phone signs the next person into the
   * previous person's account.
   */
  expect(code('stores/authStore.ts')).toMatch(/await forgetGoogleSession\(\)/);
});
