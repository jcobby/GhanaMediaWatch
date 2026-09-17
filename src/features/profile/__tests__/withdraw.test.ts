import fs from 'fs';
import path from 'path';

/**
 * Taking down a report, by the one person who may.
 *
 * `DELETE /incidents/{incidentId}` is documented as an **author-only soft
 * delete**, and both halves of that shape the feature.
 *
 * **Author-only.** An editor cannot remove a report from the verification desk.
 * Neither can a platform owner, nor an organisation the report was routed to —
 * their tools are takedown requests, legal holds and the retention purge, all
 * of which leave a record of who decided what. The asymmetry is the point: an
 * institution able to quietly delete footage about itself is the failure this
 * platform exists to prevent, while a reporter withdrawing their own is simply
 * their decision about a thing they filmed. So the control lives on exactly one
 * screen in the product — the reporter's own report sheet.
 *
 * **Soft.** The record survives for lawful process and for any organisation
 * that already licensed it. The confirmation says so rather than promising an
 * erasure nobody can perform, because that is the kind of promise somebody
 * decides to film something on.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the request is the documented one', () => {
  const http = code('api/http.ts');
  expect(http).toMatch(/async deleteIncident\(incidentId: string\): Promise<void>/);
  expect(http).toMatch(/`\/incidents\/\$\{encodeURIComponent\(incidentId\)\}`/);
  expect(http).toMatch(/method: 'DELETE'/);
});

test('it is offered on the reporter’s own sheet and nowhere else', () => {
  /*
   * The service refuses it to everybody but the author, so a delete control on
   * the editorial desk or an organisation's inbox would be a button that always
   * fails — and worse, one that implies a power the platform deliberately
   * withholds.
   */
  expect(code('features/profile/ReportSheetBody.tsx')).toMatch(/useDeleteIncident\(\)/);

  const elsewhere = [
    'features/incident/IncidentDetailScreen.tsx',
    'features/feed/FeedScreen.tsx',
  ].filter((rel) => code(rel).includes('useDeleteIncident'));
  expect(elsewhere).toEqual([]);
});

test('it asks first, and the question is destructive', () => {
  const sheet = code('features/profile/ReportSheetBody.tsx');
  expect(sheet).toMatch(/Alert\.alert\(/);
  expect(sheet).toMatch(/style: 'destructive'/);
  expect(sheet).toMatch(/style: 'cancel'/);
});

test('the confirmation does not promise an erasure', () => {
  /*
   * It is a soft delete. Telling a reporter their footage is gone would be a
   * promise the platform cannot keep, and the sort somebody acts on.
   */
  const en = JSON.parse(read('i18n/locales/en.json')) as {
    profile: Record<string, string>;
  };
  expect(en.profile.withdrawBody).toMatch(/lawful process/i);
  expect(en.profile.withdrawBody).toMatch(/already\s+licensed it keeps their copy/i);
  expect(en.profile.withdrawBody).not.toMatch(/permanently|erased|destroyed|deleted for ?ever/i);
});

test('a refusal is shown in the server’s own words', () => {
  /*
   * The interesting failure is a 403 — this account is not the author — and a
   * generic "something went wrong" would send somebody to check their
   * connection about a permission rule.
   */
  expect(code('features/profile/ReportSheetBody.tsx')).toMatch(
    /error instanceof Error \? error\.message/,
  );
});

test('the list is re-read rather than edited in place', () => {
  /*
   * The server decides what a withdrawn report leaves behind — it is a soft
   * delete, so "gone" is its answer to give. Splicing the row out locally would
   * show somebody a list the service disagrees with.
   */
  const hook = code('hooks/useIncidents.ts');
  expect(hook).toMatch(/invalidateQueries\(\{ queryKey: queryKeys\.myIncidents\(\) \}\)/);
  expect(hook).not.toMatch(/setQueryData[\s\S]{0,80}deleteIncident/);
});

test('the sheet closes on what it was showing being withdrawn', () => {
  // Leaving it open over a report that no longer exists is the app
  // contradicting itself on the screen that just acted.
  expect(code('features/profile/ProfileScreen.tsx')).toMatch(/onWithdrawn=\{\(\) =>/);
});
