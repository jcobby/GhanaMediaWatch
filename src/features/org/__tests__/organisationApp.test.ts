import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import {
  ASSIGNMENT_STATUSES,
  ORG_INCIDENT_STATUSES,
  ORG_RESPONSE_ACTIONS,
} from '@/types/org';

/**
 * The organisation account, as the phone offers it.
 *
 * Read from source rather than rendered: every one of these is a network call
 * against endpoints no account this machine can create is allowed to reach, so
 * the questions worth asking are about what the code sends and what it claims,
 * not about what a test renderer draws.
 *
 * Verified against `/v1/openapi.json` on 18 September 2026. Where a value below
 * is an enumeration, it is the service's own list — a client that offers a
 * sixth assignment status or a seventh response action is offering a button the
 * service answers 400 to.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the enumerations match the service exactly', () => {
  expect([...ASSIGNMENT_STATUSES]).toEqual([
    'assigned',
    'accepted',
    'en_route',
    'on_scene',
    'closed',
  ]);
  expect([...ORG_INCIDENT_STATUSES]).toEqual(['in_review', 'actioned', 'dismissed']);
  expect([...ORG_RESPONSE_ACTIONS].sort()).toEqual([
    'acknowledged',
    'closed_no_action',
    'inspecting',
    'more_info_requested',
    'referred',
    'resolved',
  ]);
});

test('every enumerated value has words for it', () => {
  /*
   * A status nobody here can put into words is worse rendered raw than not
   * rendered: "closed_no_action" on somebody's own report is not an answer.
   */
  // The namespace mixes flat copy with the enum sub-objects, so it is read as
  // an index rather than as its inferred literal shape.
  const org = en.org as unknown as Record<string, Record<string, string> | undefined>;
  for (const status of ASSIGNMENT_STATUSES) expect(org.assignment?.[status]).toBeTruthy();
  for (const status of ORG_INCIDENT_STATUSES) expect(org.status?.[status]).toBeTruthy();
  for (const action of ORG_RESPONSE_ACTIONS) expect(org.response?.[action]).toBeTruthy();
});

test('each endpoint is the one the service documents', () => {
  const http = code('api/http.ts');
  expect(http).toMatch(/this\.request<[^>]*>\('\/org\/dashboard', \{ orgId \}\)/);
  expect(http).toMatch(/'\/org\/inbox\?limit=50'/);
  expect(http).toMatch(/\/org\/incidents\/\$\{encodeURIComponent\(incidentId\)\}\/license/);
  expect(http).toMatch(/\/org\/incidents\/\$\{encodeURIComponent\(incidentId\)\}\/response/);
  expect(http).toMatch(/\/org\/incidents\/\$\{encodeURIComponent\(incidentId\)\}\/status/);
  expect(http).toMatch(/\/org\/incidents\/\$\{encodeURIComponent\(incidentId\)\}\/publish/);
  expect(http).toMatch(/'\/org\/assignments\?limit=50'/);
  expect(http).toMatch(/'\/org\/members\?limit=100'/);
});

test('licensing sends no body, because the price is not the client’s to name', () => {
  /*
   * `POST /org/incidents/{id}/license` takes an empty object — the terms come
   * from the organisation's plan and the reporter's destination choice. A client
   * that could name a price could name the wrong one, and the wrong one here is
   * somebody's commission.
   */
  const http = code('api/http.ts');
  const license = http.slice(http.indexOf('async licenseIncident'));
  expect(license.slice(0, 400)).toMatch(/method: 'POST', body: \{\}/);
});

test('a licence the service confirmed is not read back as a failure', () => {
  /*
   * The call answered 200, which is the service saying it created the licence
   * and the commission. Defaulting an absent `licensed` flag to false would tell
   * an organisation its money bought nothing.
   */
  expect(code('api/http.ts')).toMatch(/licensed: res\.licensed \?\? true/);
});

test('publishing is offered only on a licensed report', () => {
  /*
   * The service's rule, not this screen's: a publication request on an
   * unlicensed report is refused. Showing the button anyway would be a control
   * whose only outcome is a 403 nobody can explain.
   */
  const screen = code('features/org/OrgReportScreen.tsx');
  expect(screen).toMatch(/report\.licensed \? \(\s*<Button\s+label=\{t\('org\.publishAction'\)\}/);
});

test('the desk is chosen, never defaulted', () => {
  /*
   * `POST /org/incidents/{id}/publish` rejects a missing `section` with 400 and
   * the server invents none — deliberately, because a report released with no
   * desk does not appear in the mobile feed at all, silently.
   */
  const screen = code('features/org/OrgReportScreen.tsx');
  expect(screen).toMatch(/NEWS_SECTIONS\.map\(\(section\) =>/);
  expect(screen).not.toMatch(/section: 'ghana'/);
});

test('licences are the service’s record of them', () => {
  /*
   * There is no `/org/licences` endpoint. `licensed` and `licensedAt` on each
   * inbox item are the whole record, and a licence the service did not date says
   * so rather than sorting to the top as though it were bought a moment ago.
   */
  const hook = code('hooks/useOrg.ts');
  expect(hook).toMatch(/if \(!a\.licensedAt\) return 1;/);
  expect(code('features/org/OrgLicencesScreen.tsx')).toMatch(/org\.licensedDateUnknown/);
});

test('an unapproved organisation is a state, not an outage', () => {
  /*
   * The service refuses every `/org/*` route but onboarding for a pending
   * organisation — `check: "org_pending"` — so the inbox behind this is empty by
   * design. `/me` marks the membership `verified: false`; anything else,
   * including a server that omits the field, is treated as approved.
   */
  expect(code('stores/authStore.ts')).toMatch(/verified: named\?\.verified !== false/);
  expect(code('features/org/OrgAccountScreen.tsx')).toMatch(/orgVerified === false/);
});

test('the report screen plays the footage rather than showing a frame of it', () => {
  /*
   * This shipped as a `Thumbnail` — a still — and a video report was a frozen
   * frame with no way to play it. On the one screen whose whole purpose is
   * deciding whether to pay for footage.
   *
   * It is the second time this app has had a video that cannot be played;
   * `IncidentStage` was written the first time, and it carries the buffering
   * state, the expired-URL failure and the "this file is 8 KB of filler" case.
   * A fourth copy of that is not wanted, and neither is a still.
   */
  const screen = code('features/org/OrgReportScreen.tsx');
  expect(screen).toMatch(/<IncidentStage\s+incident=\{report\}/);
  expect(screen).not.toMatch(/<Thumbnail/);
});

test('every screen that shows one report shows it playing', () => {
  /*
   * Lists are stills — a feed that opens twelve players is a feed that drops
   * frames — but a screen showing a single report is a screen somebody opened
   * to watch it.
   */
  for (const file of [
    'features/org/OrgReportScreen.tsx',
    'features/incident/IncidentDetailScreen.tsx',
    'features/profile/ReportSheetBody.tsx',
  ]) {
    expect([file, /IncidentStage/.test(code(file))]).toEqual([file, true]);
  }
});

test('nothing in the organisation app invents its own data', () => {
  const dir = path.join(SRC, 'features/org');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.tsx')) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    expect([file, /@\/api\/(fixtures|mockData|dawuroData)/.test(src)]).toEqual([file, false]);
  }
});
