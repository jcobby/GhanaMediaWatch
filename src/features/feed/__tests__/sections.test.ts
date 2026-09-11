import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { DESKS, NEWS_SECTIONS, adjacentDesk, type NewsSection } from '@/types/sections';
import en from '@/i18n/locales/en.json';

/**
 * Every desk has something on it.
 *
 * A masthead of six tabs where four open onto an empty list is the fastest way
 * to make a product look abandoned — and it is a failure with no symptom until
 * somebody taps the fourth one in a demo.
 */

test('no desk is empty', () => {
  const empty = NEWS_SECTIONS.filter((s) => !SAMPLE_INCIDENTS.some((i) => i.section === s));
  expect(empty).toEqual([]);
});

test('every desk has a name', () => {
  const names = (en as { section: Record<string, string> }).section;
  const missing = NEWS_SECTIONS.filter((s) => !names[s]);
  expect(missing).toEqual([]);
});

test('every report is on a real desk', () => {
  const known = new Set<string>(NEWS_SECTIONS);
  const stray = SAMPLE_INCIDENTS.filter((i) => !known.has(i.section)).map((i) => i.section);
  expect([...new Set(stray)]).toEqual([]);
});

test('Ghana carries the most, as an agency here would', () => {
  // The local desk is the product. If another desk ever outgrew it, the
  // seeding has drifted away from what this platform actually collects.
  const counts = NEWS_SECTIONS.map(
    (s) => [s, SAMPLE_INCIDENTS.filter((i) => i.section === s).length] as const,
  );
  const top = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  expect(top[0]).toBe('ghana');
});

test('the desk is independent of the category', () => {
  // They are different axes. If every report on a desk shared one category the
  // two would have collapsed into each other, and routing would be keying off
  // an editorial decision.
  const ghana = SAMPLE_INCIDENTS.filter((i) => i.section === 'ghana');
  expect(new Set(ghana.map((i) => i.category)).size).toBeGreaterThan(1);
});

/**
 * Swipe navigation between desks.
 *
 * The strip is a row of tabs, but a reader on a phone swipes. The two must
 * agree: swiping left has to land on the tab visibly to the right, and the
 * ends have to stop rather than wrap. A wrap from Sport to Latest looks
 * exactly like a scroll position being lost, and on a feed of headlines the
 * reader has no way to tell which happened.
 */
describe('swiping between desks', () => {
  test('Latest is the first position, not the absence of one', () => {
    expect(DESKS[0]).toBeNull();
    expect(DESKS.slice(1)).toEqual(NEWS_SECTIONS);
  });

  test('a swipe moves one desk in the direction of the strip', () => {
    expect(adjacentDesk(null, 1)).toBe('ghana');
    expect(adjacentDesk('ghana', 1)).toBe('africa');
    expect(adjacentDesk('africa', -1)).toBe('ghana');
    expect(adjacentDesk('ghana', -1)).toBeNull();
  });

  test('the ends clamp rather than wrap', () => {
    // Off the left of Latest.
    expect(adjacentDesk(null, -1)).toBeNull();
    // Off the right of the last desk.
    const last = NEWS_SECTIONS[NEWS_SECTIONS.length - 1]!;
    expect(adjacentDesk(last, 1)).toBe(last);
  });

  test('every desk is reachable by swiping from Latest', () => {
    // Guards the off-by-one that leaves the final desk unreachable: walk the
    // whole strip one step at a time and assert it visits all of them.
    const seen: (NewsSection | null)[] = [null];
    let at: NewsSection | null = null;
    for (let i = 0; i < NEWS_SECTIONS.length; i += 1) {
      at = adjacentDesk(at, 1);
      seen.push(at);
    }
    expect(seen).toEqual(DESKS);
  });

  test('a desk that no longer exists falls back to Latest', () => {
    // A stored value from an older build must not strand the reader on a tab
    // the strip cannot show.
    expect(adjacentDesk('tech' as NewsSection, 1)).toBe('ghana');
  });
});

/**
 * The reporter keeps the credit when an institution publishes.
 *
 * `publisher` is a union, so the moment an organisation releases a report it
 * structurally cannot also hold the reporter's name — the feed would read as
 * though the institution filmed it. `reporter` is a separate field for exactly
 * that case, and this is the case that proves it, so the fixtures have to
 * actually contain one.
 */
describe('reporter and publisher are separate parties', () => {
  test('some reports are published by an organisation', () => {
    // Without this the rest of the block passes vacuously.
    const byOrg = SAMPLE_INCIDENTS.filter((i) => i.publisher.kind === 'organisation');
    expect(byOrg.length).toBeGreaterThan(0);
  });

  test('at least one organisation-published report names its reporter', () => {
    /*
     * Not "all of them" — a reporter may legitimately file anonymously, and an
     * institution can publish that. But if *every* org-published fixture were
     * anonymous, the "Filed by …" line under the organisation name would never
     * render in the demo, and the one case the field exists for would go
     * unexercised while the tests stayed green.
     */
    const byOrg = SAMPLE_INCIDENTS.filter((i) => i.publisher.kind === 'organisation');
    const named = byOrg.filter((i) => i.reporter.kind === 'user' && i.reporter.displayName.trim());
    expect(named.length).toBeGreaterThan(0);
  });

  test('every report has a reporter, whoever published it', () => {
    const missing = SAMPLE_INCIDENTS.filter(
      (i) => !i.reporter || !['user', 'anonymous'].includes(i.reporter.kind),
    ).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  test('an organisation is never itself the reporter', () => {
    // Institutions publish; people film. A reporter typed as an organisation
    // would mean the credit had been folded back into the publisher.
    const wrong = SAMPLE_INCIDENTS.filter(
      (i) => (i.reporter as { kind: string }).kind === 'organisation',
    ).map((i) => i.id);
    expect(wrong).toEqual([]);
  });
});

/**
 * The expandable caption has something to expand.
 *
 * The detail screen shows three lines and offers "More" only when the text
 * actually overflows — which is right, but it means that if every fixture is
 * short the control never appears and the expanded state cannot be reached at
 * all. That is a branch of the interface which exists, renders correctly, and
 * is impossible to look at, so nothing ever reports it broken.
 */
describe('the long-caption fixture', () => {
  // Three lines at roughly 42 characters on a phone is ~126. Well past it,
  // so the assertion does not hinge on the exact wrap width of one device.
  const OVERFLOWS = 260;

  test('at least one report is long enough to need "More"', () => {
    const longest = Math.max(...SAMPLE_INCIDENTS.map((i) => i.description.length));
    expect(longest).toBeGreaterThan(OVERFLOWS);
  });

  test('most reports are still short', () => {
    // The long one is there to exercise a control, not to become the norm —
    // a feed of essays would not be testing the collapsed state any more.
    const long = SAMPLE_INCIDENTS.filter((i) => i.description.length > OVERFLOWS);
    expect(long.length).toBeLessThan(SAMPLE_INCIDENTS.length / 2);
  });
});

/**
 * Agency copy is not a citizen report, and never pretends to be.
 *
 * The feed has six desks and only Ghana can be filled by people standing in
 * front of something. The other five carry the newsroom's own stories, and
 * before `origin` existed those were dressed as incident reports: a summit in
 * Abuja with GPS coordinates, a named citizen reporter who had supposedly
 * filmed it, and a "Captured 11:17 AM" stamp.
 *
 * That is a trust-model failure, not a cosmetic one. The product's two promises
 * are that a report was captured where and when it says, and that the person
 * who filmed it gets paid when it is used. A wire story wearing a capture stamp
 * breaks the first; a wire story with a reporter attached breaks the second.
 */
describe('newsroom copy and citizen reports stay distinguishable', () => {
  const newsroom = SAMPLE_INCIDENTS.filter((i) => i.origin === 'newsroom');
  const citizen = SAMPLE_INCIDENTS.filter((i) => i.origin === 'citizen_report');

  test('the feed carries both kinds', () => {
    // Neither may be empty or the rest of this block proves nothing.
    expect(newsroom.length).toBeGreaterThan(0);
    expect(citizen.length).toBeGreaterThan(0);
  });

  test('only the Ghana desk carries citizen reports', () => {
    const misfiled = citizen.filter((i) => i.section !== 'ghana').map((i) => i.id);
    expect(misfiled).toEqual([]);
  });

  test('every desk beyond Ghana is filled by the newsroom', () => {
    // The supply problem stated as a test: if these desks are offered, they
    // have to be fillable, and this is what fills them.
    const desks = new Set(newsroom.map((i) => i.section));
    for (const section of NEWS_SECTIONS) {
      if (section === 'ghana') continue;
      expect([section, desks.has(section)]).toEqual([section, true]);
    }
  });

  test('agency copy claims no capture', () => {
    // `capturedAtIso` null is the honest answer, not missing data: there was
    // no capture to timestamp.
    const stamped = newsroom.filter((i) => i.capturedAtIso !== null).map((i) => i.id);
    expect(stamped).toEqual([]);
  });

  test('agency copy claims no capture location', () => {
    // A coordinate is a claim that somebody was standing there. The dateline
    // stays — that is where the story is *about* — but the pin goes.
    const placed = newsroom
      .filter((i) => i.location.latitude !== null || i.location.longitude !== null)
      .map((i) => i.id);
    expect(placed).toEqual([]);
  });

  test('agency copy credits no citizen reporter', () => {
    // Nobody filmed it, so there is nobody to credit — and, downstream, nobody
    // to pay a commission to.
    const credited = newsroom.filter((i) => i.reporter.kind === 'user').map((i) => i.id);
    expect(credited).toEqual([]);
  });

  test('agency copy is published by the agency itself', () => {
    const wrong = newsroom.filter((i) => i.publisher.kind !== 'organisation').map((i) => i.id);
    expect(wrong).toEqual([]);
  });

  test('citizen reports keep everything they always had', () => {
    // The other direction: the change must not have stripped provenance from
    // the reports that legitimately carry it.
    const withCapture = citizen.filter((i) => i.capturedAtIso !== null);
    expect(withCapture.length).toBeGreaterThan(0);

    const located = citizen.filter((i) => i.location.latitude !== null);
    expect(located.length).toBeGreaterThan(0);
  });
});
