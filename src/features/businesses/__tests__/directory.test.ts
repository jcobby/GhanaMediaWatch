import { BUSINESSES, SURVEYS } from '@/api/dawuroData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';

/**
 * The business pages have something on them.
 *
 * A directory whose pages all open onto three empty tabs is worse than no
 * directory — it makes the product look unfinished in the one place someone
 * goes looking for depth. These assert the seeded data supports the screens.
 */

const listed = BUSINESSES.filter((b) => b.subscriptionStatus !== 'cancelled');

test('there are organisations to list', () => {
  expect(listed.length).toBeGreaterThan(2);
});

test('some reports are credited to an organisation', () => {
  // Without this the Reports tab is empty for everyone and the feature is a
  // directory of blank pages.
  expect(SAMPLE_INCIDENTS.filter((i) => i.publisher.kind === 'organisation').length)
    .toBeGreaterThan(0);
});

test('every credited organisation exists in the directory', () => {
  const ids = new Set(BUSINESSES.map((b) => b.id));
  const orphans = SAMPLE_INCIDENTS.filter(
    (i) => i.publisher.kind === 'organisation' && !ids.has(i.publisher.id),
  ).map((i) => (i.publisher.kind === 'organisation' ? i.publisher.id : ''));

  // A credited publisher with no directory entry opens onto "not found".
  expect([...new Set(orphans)]).toEqual([]);
});

test('at least one organisation has both reports and a survey', () => {
  // Three tabs; one business must exercise more than one of them or the
  // layout has never been seen populated.
  const rich = listed.filter(
    (b) =>
      SAMPLE_INCIDENTS.some(
        (i) => i.publisher.kind === 'organisation' && i.publisher.id === b.id,
      ) && SURVEYS.some((s) => s.businessId === b.id),
  );
  expect(rich.length).toBeGreaterThan(0);
});

test('reporters remain the majority of publishers', () => {
  // Most reports come from the public. If organisations dominated, the model
  // would have quietly inverted into a news app.
  const org = SAMPLE_INCIDENTS.filter((i) => i.publisher.kind === 'organisation').length;
  expect(org).toBeLessThan(SAMPLE_INCIDENTS.length / 2);
});
