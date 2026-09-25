import fs from 'fs';
import path from 'path';

/**
 * Where the line between the phone and the web console now falls.
 *
 * It used to be "everything but the reporter lives in the console", and that was
 * the right call at the time: the phone carried a platform console, an org
 * dashboard with saved queries, an org inbox and a survey builder, all reading
 * seeded constants, and none of them reachable — the organisation tier was
 * behind a flag that was off and the screens had no entry point. They were
 * removed rather than kept half-wired.
 *
 * The line has moved, for one reason: the service pushes `report_routed` to org
 * members. An alert lands on a phone, and an alert that can only be acted on at
 * a desk waits until somebody is at one. So the organisation's *field* work is
 * back — the routed inbox, licensing, answering the reporter, dispatching
 * somebody, asking an editor to run it — and it is back on the real endpoints,
 * scoped by the organisation header, with no fixtures behind any of it.
 *
 * What stays in the console is the desk work: routing submissions, payouts,
 * approving organisations, the editorial queue, billing, seats, saved queries,
 * survey building and the audit trail. These rules keep that side out, and keep
 * the side that came back from coming back the way it went.
 */

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string) => path.relative(SRC, file).replace(/\\/g, '/');

test('the platform and editorial screens are still gone', () => {
  for (const dir of [
    'features/platform',
    'features/organisation',
    'app/platform',
    'app/organisation',
    'lib/features.ts',
    'app/surveys/new.tsx',
  ]) {
    expect([dir, fs.existsSync(path.join(SRC, dir))]).toEqual([dir, false]);
  }
});

test('nothing on the phone calls a platform or editorial endpoint', () => {
  /*
   * `/org/*` is deliberately not on this list any more — those are the calls the
   * organisation app is made of. `/platform/*` and `/editorial/*` answer 403 to
   * every account this app can produce, so a call to one is either dead code or
   * a screen that can only render a refusal.
   */
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = code(rel(file));
    if (/['"`]\/(platform|editorial)(\/|['"`])/.test(src)) offenders.push(rel(file));
  }
  expect(offenders).toEqual([]);
});

test('every organisation call names the organisation it is for', () => {
  /*
   * The service refuses every `/org/*` route outright without `X-Dawuro-Org` —
   * 403, `check: "org_header"`, before it looks at the token. So a call that
   * cannot send one is not a degraded call, it is a guaranteed failure, and the
   * cheapest place to make that impossible is the signature: every org method on
   * the client takes an `orgId`.
   */
  const client = code('api/client.ts');
  const orgSection = client.slice(client.indexOf('getOrgDashboard'));
  const methods = [...orgSection.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]!);
  expect(methods.length).toBeGreaterThan(5);
  for (const method of methods) {
    const signature = orgSection.slice(orgSection.indexOf(`${method}(`));
    expect([method, /^\w+\(\s*orgId: string/.test(signature)]).toEqual([method, true]);
  }

  // And the header actually goes out.
  expect(code('api/http.ts')).toMatch(/options\.orgId \? \{ 'X-Dawuro-Org': options\.orgId \} : \{\}/);
});

test('licensing cannot charge twice for the same report', () => {
  /*
   * A licence is money: it bills the organisation and creates the reporter's
   * commission. The report's own id is the idempotency key, so a double tap, a
   * retry after a timeout, or a screen that mounts again mid-request all resolve
   * to the one purchase the service already made.
   */
  expect(code('api/http.ts')).toMatch(/idempotencyKey: `license:\$\{incidentId\}`/);
});

test('the licences list is read from the service, not kept on the phone', () => {
  /*
   * This is the bug the web console still has, and the reason it cannot be
   * copied here: it holds the licensed set in a browser `useState`, so a reload
   * loses every licence bought that session along with any way to act on one.
   *
   * `licensed` and `licensedAt` on each `/org/inbox` item are the service's own
   * record, and they are what this screen is built from.
   */
  const hook = code('hooks/useOrg.ts');
  expect(hook).toMatch(/filter\(\(item\) => item\.licensed\)/);
  expect(hook).not.toMatch(/useState/);
  expect(code('api/http.ts')).toMatch(/licensed: raw\.licensed === true/);
});

test('the role comes from the server', () => {
  /*
   * It used to be `role: org ? 'admin' : null` — the phone granting itself the
   * second-highest role in an organisation for belonging to one. The service
   * decides what a token may do regardless, but the screens read this, so a
   * viewer was shown every control an administrator has and found out what they
   * could not do from a 403 after tapping a button that spends money.
   */
  const store = code('stores/authStore.ts');
  expect(store).not.toMatch(/role: org \? 'admin'/);
  expect(store).toMatch(/me\.role \?\? named\?\.role/);
  expect(store).not.toMatch(/accountType: 'platform_owner'/);
});

test('each account lands in the shell the server put it in', () => {
  /*
   * One function, used by all three places that send somebody home. Three copies
   * of this decision is how an operator comes to be routed correctly on launch
   * and into the reporter app after signing in.
   */
  const home = code('lib/homeRoute.ts');
  expect(home).toMatch(/accountType !== 'organisation'\) return '\/\(tabs\)'/);
  /*
   * And the third destination: an organisation the platform has not approved
   * may call `/org/onboarding/*` and nothing else, so it goes to the
   * application rather than to four tabs of refusals.
   */
  expect(home).toMatch(
    /orgVerified === false \? '\/onboarding\/organisation' : '\/\(org\)'/,
  );
  expect(code('app/index.tsx')).toMatch(/homeRouteFor\(profile\)/);
  expect(code('features/auth/SignInScreen.tsx')).toMatch(/homeRouteFor\(profile \?\? null\)/);
  expect(code('features/auth/SignUpScreen.tsx')).toMatch(/homeRouteFor\(/);
  // A reporter who deep-links into the organisation shell is sent back rather
  // than shown four screens of refusals.
  expect(code('app/(org)/_layout.tsx')).toMatch(/if \(!isOrg\) return <Redirect href="\/\(tabs\)" \/>/);
  // Nothing grants an organisation client-side; it is read from `/me`.
  expect(code('stores/authStore.ts')).not.toMatch(/signInAsOrganisation/);
});

test('the public organisation directory stays', () => {
  expect(fs.existsSync(path.join(SRC, 'features/organisations'))).toBe(true);
  expect(code('features/feed/FeedScreen.tsx')).toMatch(/\/organisations/);
});
