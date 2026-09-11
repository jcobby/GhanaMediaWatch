import { ORGANISATIONS, SURVEYS } from '@/api/dawuroData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';

/**
 * The organisation pages have something on them.
 *
 * A directory whose pages all open onto three empty tabs is worse than no
 * directory — it makes the product look unfinished in the one place someone
 * goes looking for depth. These assert the seeded data supports the screens.
 */

const listed = ORGANISATIONS.filter((b) => b.subscriptionStatus !== 'cancelled');

test('there are organisations to list', () => {
  expect(listed.length).toBeGreaterThan(2);
});

test('some reports are credited to an organisation', () => {
  // Without this the Reports tab is empty for everyone and the feature is a
  // directory of blank pages.
  expect(
    SAMPLE_INCIDENTS.filter((i) => i.publisher.kind === 'organisation').length,
  ).toBeGreaterThan(0);
});

test('every credited organisation exists in the directory', () => {
  /*
   * Citizen reports only.
   *
   * The directory lists institutions that license footage. The agency also
   * appears as a publisher — on its own newsroom copy — but it is not a
   * customer and has no entry, which is why the app does not make that byline
   * tappable. Including it here would demand a directory page for the platform
   * itself.
   */
  const ids = new Set(ORGANISATIONS.map((b) => b.id));
  const orphans = SAMPLE_INCIDENTS.filter(
    (i) =>
      i.origin === 'citizen_report' &&
      i.publisher.kind === 'organisation' &&
      !ids.has(i.publisher.id),
  ).map((i) => (i.publisher.kind === 'organisation' ? i.publisher.id : ''));

  // A credited publisher with no directory entry opens onto "not found".
  expect([...new Set(orphans)]).toEqual([]);
});

test('at least one organisation has both reports and a survey', () => {
  // Three tabs; one organisation must exercise more than one of them or the
  // layout has never been seen populated.
  const rich = listed.filter(
    (b) =>
      SAMPLE_INCIDENTS.some(
        (i) => i.publisher.kind === 'organisation' && i.publisher.id === b.id,
      ) && SURVEYS.some((s) => s.businessId === b.id),
  );
  expect(rich.length).toBeGreaterThan(0);
});

test('reporters remain the majority of publishers of citizen reports', () => {
  /*
   * Most *reports* come from the public. If institutions dominated them, the
   * model would have quietly inverted into a licensing house.
   *
   * Measured within citizen reports rather than across the whole feed. Agency
   * copy is published by the agency by definition, so counting it would make
   * this fail the moment a wire story is added — a fact about the newsroom
   * masquerading as a fact about who files reports.
   */
  const reports = SAMPLE_INCIDENTS.filter((i) => i.origin === 'citizen_report');
  const org = reports.filter((i) => i.publisher.kind === 'organisation').length;
  expect(org).toBeLessThan(reports.length / 2);
});
