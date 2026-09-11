import fs from 'fs';
import path from 'path';

/**
 * Organisation routes are scoped by a header, and not sending it was total.
 *
 * The service refuses every `/org/…` endpoint outright unless the request names
 * the organisation it is for. Verified against the live service rather than read
 * off a spec — the OpenAPI document declares only `bearerAuth` on these routes
 * and says nothing about this:
 *
 *     no header             → 403  FORBIDDEN  check: "org_header"
 *     header, not a member  → 403  FORBIDDEN  check: "membership"
 *     header, member        → 200
 *
 * The middle case is why it is a scope declaration rather than a secret: naming
 * an organisation you do not belong to gets you nothing. The first case held
 * even for a token that already carried an `orgId` claim, which is what makes
 * this impossible to work around from the token side.
 *
 * **What it broke here was worse than a refused screen.** Membership was
 * discovered by probing `/org/dashboard` and reading a refusal as "not a
 * member" — a stand-in written before any endpoint described the caller. That
 * probe cannot send the header, because the id it would name is the thing it is
 * calling the endpoint to find out. So it was refused every time, and every
 * organisation account on this phone silently became a reporter.
 *
 * Read from source: these are network calls with no device to make them on.
 */

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the scope header goes out whenever a call declares an organisation', () => {
  expect(code('api/http.ts')).toMatch(
    /options\.orgId \? \{ 'X-Dawuro-Org': options\.orgId \} : \{\}/,
  );
});

test('the organisation endpoint declares one', () => {
  // Without this the header is a parameter nothing ever passes.
  expect(code('api/http.ts')).toMatch(/'\/org\/dashboard', \{ orgId \}/);
});

test('it is a required argument, not an optional courtesy', () => {
  /*
   * A caller that forgets it gets a 403 at runtime and no warning at build
   * time, which is the failure this whole file exists about. The type makes
   * forgetting it impossible.
   */
  expect(code('api/client.ts')).toMatch(/getOrgDashboard\(orgId: string\): Promise<OrgDashboard>/);
});

describe('membership is asked for, not inferred from a refusal', () => {
  test('the caller is described by its own endpoint', () => {
    /*
     * `/me` is about the caller rather than about an organisation, so it needs
     * no scope — which is precisely why it can answer the question the probe
     * could not.
     */
    expect(code('api/http.ts')).toMatch(/this\.request<Partial<Caller>>\('\/me'\)/);
  });

  test('the sign-in path no longer probes an organisation endpoint', () => {
    /*
     * The bug in one line: a refusal meant "not a member", and after the header
     * landed every caller was refused. An organisation operator signed in and
     * got a reporter's app.
     */
    const store = code('stores/authStore.ts');
    expect(store).toMatch(/await api\.getCaller\(\)/);
    expect(store).not.toMatch(/api\.getOrgDashboard\(/);
  });

  test('a membership that is not the default still counts', () => {
    /*
     * Somebody can belong to an organisation without it being their default —
     * the console found the top-level `orgId` null on accounts whose
     * memberships list was not empty.
     */
    expect(code('stores/authStore.ts')).toMatch(/me\.memberships\.find\(\(m\) => m\.orgId\)/);
  });

  test('a missing name does not demote a member to a reporter', () => {
    // The organisation is established by the id. A name the server did not
    // send is a display problem, not a membership one.
    expect(code('stores/authStore.ts')).toMatch(/name: named\?\.name \?\? id/);
  });

  test('a failure still lands on reporter, which is the common case', () => {
    // Most accounts are not organisations, and an unreachable `/me` must not
    // stop somebody filing a report.
    const describe = code('stores/authStore.ts');
    const fn = describe.slice(describe.indexOf('async function describeOrg'));
    expect(fn).toMatch(/catch \{\s*return null;/);
  });
});
