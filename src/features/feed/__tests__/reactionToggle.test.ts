import { QueryClient } from '@tanstack/react-query';
import { queryKeys, toggleReactionIn } from '@/hooks/useIncidents';
import type { Incident, Page } from '@/types/api';

/**
 * Reacting has no endpoint yet, so the whole behaviour is the cache write.
 *
 * These guard the two things that are easy to get wrong when faking it: the
 * same report sitting in more than one cached list, and a count that can be
 * driven negative by a stale entry.
 */

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc_1',
    counts: { reactions: 4, comments: 0 },
    viewerHasReacted: false,
    ...overrides,
  } as Incident;
}

function page(items: Incident[]): Page<Incident> {
  return { items, nextCursor: null } as Page<Incident>;
}

/** Indexing is checked in this project, so reach into a list deliberately. */
function at<T>(items: T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`no item at index ${index}`);
  return value;
}

const clients: QueryClient[] = [];

function client(): QueryClient {
  // `gcTime: Infinity` keeps React Query from scheduling a garbage-collection
  // timer per cached query — those timers are open handles, and with the
  // five-minute default they hold Jest open long after the assertions pass.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(qc);
  return qc;
}

afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
});

test('every cached feed page is updated, not just the one on screen', () => {
  const qc = client();

  // The same report, cached twice: once unfiltered, once under a filter.
  const filtered = queryKeys.feed({ limit: 20, category: ['flood'] });
  qc.setQueryData(queryKeys.feed({ limit: 20 }), page([incident(), incident({ id: 'inc_2' })]));
  qc.setQueryData(filtered, page([incident()]));

  toggleReactionIn(qc, incident());

  const a = qc.getQueryData<Page<Incident>>(queryKeys.feed({ limit: 20 }))!;
  const b = qc.getQueryData<Page<Incident>>(filtered)!;

  expect(at(a.items, 0).viewerHasReacted).toBe(true);
  expect(at(a.items, 0).counts.reactions).toBe(5);
  // If this drifts from the assertion above, the two lists contradict each
  // other the moment the reader changes filter.
  expect(at(b.items, 0).viewerHasReacted).toBe(true);
  expect(at(b.items, 0).counts.reactions).toBe(5);

  // Other reports on the same page are untouched.
  expect(at(a.items, 1).viewerHasReacted).toBe(false);
  expect(at(a.items, 1).counts.reactions).toBe(4);
});

test('the detail view agrees with the feed', () => {
  const qc = client();
  qc.setQueryData(queryKeys.feed({}), page([incident()]));
  qc.setQueryData(queryKeys.incident('inc_1'), incident());

  toggleReactionIn(qc, incident());

  expect(qc.getQueryData<Incident>(queryKeys.incident('inc_1'))?.counts.reactions).toBe(5);
});

test('un-reacting cannot drive the count below zero', () => {
  const qc = client();

  // A stale entry claiming zero reactions while the viewer is marked reacted.
  const stale = incident({ viewerHasReacted: true, counts: { reactions: 0, comments: 0 } });
  qc.setQueryData(queryKeys.feed({}), page([stale]));

  toggleReactionIn(qc, stale);

  const after = qc.getQueryData<Page<Incident>>(queryKeys.feed({}));
  expect(at(after!.items, 0).counts.reactions).toBe(0);
  expect(at(after!.items, 0).viewerHasReacted).toBe(false);
});

test('reacting twice returns to where it started', () => {
  const qc = client();
  qc.setQueryData(queryKeys.feed({}), page([incident()]));

  toggleReactionIn(qc, incident());
  const once = at(qc.getQueryData<Page<Incident>>(queryKeys.feed({}))!.items, 0);
  toggleReactionIn(qc, once);

  const twice = qc.getQueryData<Page<Incident>>(queryKeys.feed({}))?.items[0];
  expect(twice?.counts.reactions).toBe(4);
  expect(twice?.viewerHasReacted).toBe(false);
});
