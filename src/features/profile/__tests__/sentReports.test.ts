import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { queryKeys } from '@/hooks/useIncidents';

/**
 * Where a report goes after it sends.
 *
 * There was no answer to this in the app. A row leaves the outbox the instant
 * it uploads — the queue only holds what is still going — and the list under
 * Profile → Reports was fetched before the report existed and was never told
 * otherwise. So the report vanished from the screen the reporter was watching
 * and did not appear on the screen that was supposed to hold it, and nothing
 * anywhere pointed from one to the other.
 *
 * Three things had to be true, and none of them were:
 *   1. finishing an upload marks the reporter's list stale;
 *   2. that list explains itself when it is empty, loading or refused;
 *   3. the emptied queue says where the sent report went.
 */

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

test('the query key is the one the uploader invalidates', () => {
  /*
   * Spelling drift is the classic way this silently stops working: the hook
   * subscribes to one key, the uploader invalidates another, nothing errors and
   * the list simply never updates. Both go through `queryKeys`.
   */
  expect(queryKeys.myIncidents()).toEqual(['me', 'incidents']);
  expect(read('services/uploader.ts')).toMatch(/queryKeys\.myIncidents\(\)/);
  expect(read('hooks/useIncidents.ts')).toMatch(/queryKey: queryKeys\.myIncidents\(\)/);
});

test('a completed upload marks the reporter list stale', () => {
  const uploader = read('services/uploader.ts');
  expect(uploader).toMatch(/invalidateQueries\(\{ queryKey: queryKeys\.myIncidents\(\) \}\)/);
});

test('the invalidation happens only after the server confirms', () => {
  /*
   * Invalidating on the attempt rather than the result would refetch a list
   * that cannot contain the report yet, and the refetched — still empty — page
   * would then be cached as current.
   */
  const uploader = read('services/uploader.ts');
  expect(uploader.indexOf('UPLOAD_COMPLETE')).toBeLessThan(uploader.indexOf('invalidateQueries'));
  // And before the media is deleted, so the ordering cannot be reshuffled into
  // a state where the file is gone but nothing knows the report arrived.
  expect(uploader.indexOf('invalidateQueries')).toBeLessThan(uploader.indexOf('deleteMedia('));
});

test('the uploader can reach a client at all', () => {
  /*
   * The reason the client moved out of the root layout. An upload finishes in
   * the background with no component mounted, so a `useQueryClient()` is not
   * available — and a second `new QueryClient()` here would invalidate a cache
   * nothing reads from.
   */
  expect(read('services/uploader.ts')).toMatch(
    /import \{ queryClient \} from '@\/lib\/queryClient'/,
  );
  expect(read('services/uploader.ts')).not.toMatch(/new QueryClient\(/);
});

test('the reports list answers all four of its states', () => {
  /*
   * It used to be `reports.map(...)` alone, so loading, failed, no-account and
   * nothing-filed-yet all rendered as the same blank space under the chips.
   */
  const screen = read('features/profile/ProfileScreen.tsx');
  const list = screen.slice(screen.indexOf("{tab === 'reports'"));

  expect(list).toMatch(/minePending \?/);
  expect(list).toMatch(/mineFailed \?/);
  expect(list).toMatch(/reports\.length === 0 \?/);
  expect(list).toMatch(/reports\.map\(/);
});

test('a guest is offered sign-in rather than a retry button', () => {
  /*
   * `/me/incidents` is refused to a device token, so a guest reaches this
   * screen as an error. "Try again" would fail identically every time; the
   * thing that resolves it is an account.
   */
  const screen = read('features/profile/ProfileScreen.tsx');
  expect(screen).toMatch(/SIGN_IN_REQUIRED/);
  expect(screen).toMatch(/router\.push\('\/\(auth\)\/sign-in'\)/);
});

test('an empty list distinguishes "none filed" from "none matching"', () => {
  /*
   * A filter hiding every report is not the same as having filed nothing, and
   * offering the camera to somebody whose reports are merely filtered out sends
   * them to film a duplicate.
   */
  const screen = read('features/profile/ProfileScreen.tsx');
  expect(screen).toMatch(/stateFilter \? t\('profile\.noneInStateTitle'\)/);
  expect(screen).toMatch(/setStateFilter\(null\) : router\.push\('\/\(tabs\)\/capture'\)/);
});

test('the emptied queue points at where sent reports live', () => {
  const outbox = read('features/outbox/OutboxScreen.tsx');
  expect(outbox).toMatch(/sentSomething/);
  expect(outbox).toMatch(/router\.push\('\/\(tabs\)\/profile'\)/);
});

test('that pointer only appears once something has actually sent', () => {
  /*
   * On a phone that has never filed, "find them under Profile" points at an
   * empty list and reads as a promise the app cannot keep.
   */
  const outbox = read('features/outbox/OutboxScreen.tsx');
  expect(outbox).toMatch(/items\.some\(\(i\) => i\.state === 'uploaded'\)/);
  expect(outbox).toMatch(/sentSomething \? t\('outbox\.allSentBody'\) : t\('outbox\.emptyBody'\)/);
});

test('every new message has words', () => {
  const profile = en.profile as unknown as Record<string, string>;
  const outbox = en.outbox as unknown as Record<string, string>;

  for (const key of [
    'noReportsTitle',
    'noReportsBody',
    'fileFirst',
    'noneInStateTitle',
    'noneInStateBody',
    'reportsErrorTitle',
    'reportsErrorBody',
  ]) {
    expect([key, Boolean(profile[key])]).toEqual([key, true]);
  }
  for (const key of ['allSentBody', 'viewSent']) {
    expect([key, Boolean(outbox[key])]).toEqual([key, true]);
  }
});

test('the empty list says what this screen is for', () => {
  /*
   * "Nothing filed yet" is a fact. The reason somebody would file anything is
   * that they get to see what an organisation did about it, and an empty screen
   * is where that promise is worth making.
   */
  const profile = en.profile as unknown as Record<string, string>;
  expect(profile.noReportsBody).toMatch(/appear here/i);
  expect(profile.noReportsBody).toMatch(/organisation|done about/i);
  expect((en.outbox as unknown as Record<string, string>).allSentBody).toMatch(/profile/i);
});

test('a failure reassures rather than alarms', () => {
  // Not being able to *list* reports does not mean they were lost, and that is
  // the first thing somebody will fear when this screen fails.
  const profile = en.profile as unknown as Record<string, string>;
  expect(profile.reportsErrorBody).toMatch(/safe/i);
});
