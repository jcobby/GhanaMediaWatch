import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { MY_REPORTS } from '@/api/mockData';
import { SUBMISSION_DESTINATIONS } from '@/types/dawuro';
import { VETTING_STATES } from '@/types/api';

/**
 * A public report is not published by choosing "public feed".
 *
 * The reporter picks a destination; an editor or the platform owner then reads
 * it on the editorial desk and decides whether it runs and on which desk. The
 * backend publishes a report only on a transition from that desk, and only when
 * the destination is `public` or `both` — a `directed` submission stays
 * exclusive and never appears publicly at all.
 *
 * The app told a different story. The outcome timeline ended at "Public feed —
 * you sent this to the public feed, so it was not routed to any organisation":
 * a terminal sentence about a report that had not yet gone anywhere, printed
 * directly beneath a badge reading "In review". The same panel said the report
 * was still being looked at and that nothing more would happen to it.
 *
 * Worse, that step was chosen by `outcome.recipients.length === 0`, which is
 * equally true of a directed report the desk has not routed yet and of any
 * report whose outcome had not loaded. Reports that had gone nowhere were
 * reported as having gone to the public feed.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const TIMELINE = 'features/profile/ReportOutcome.tsx';

describe('the review step exists at all', () => {
  test('a report bound for the feed shows that an editor has it', () => {
    const timeline = code(TIMELINE);
    expect(timeline).toMatch(/outcome\.editorial\.\$\{editorialStep\(vettingState\)\.key\}\.title/);
    expect(timeline).toMatch(/editorialStep\(vettingState\)\.icon/);

    /*
     * Through the accessor, not the record. A vetting state the service adds
     * before this build ships would otherwise be `undefined.icon` — which is
     * precisely how the console's decided page took a whole route down.
     */
    expect(timeline).toMatch(/EDITORIAL\[state\] \?\? EDITORIAL\.pending_review/);
  });

  test('every vetting state has a step, so none falls through to nothing', () => {
    /*
     * A `Record<VettingState, …>` is the compiler's half of this. The other
     * half is that each key has words behind it — a missing one renders the
     * raw i18n path on the reporter's screen with no error anywhere.
     */
    const copy = (en.outcome as unknown as { editorial: Record<string, Record<string, string>> })
      .editorial;
    const keys = {
      pending_review: 'review',
      published: 'published',
      rejected: 'rejected',
      restricted: 'restricted',
    };

    for (const state of VETTING_STATES) {
      const entry = copy[keys[state]];
      expect([state, Boolean(entry?.title)]).toEqual([state, true]);
      expect([state, Boolean(entry?.body)]).toEqual([state, true]);
      expect([state, Boolean(entry?.bodyPublic)]).toEqual([state, true]);
    }
  });

  test('the sentence that ended the story on a report still in review is gone', () => {
    expect(Object.keys(en.outcome as Record<string, unknown>)).not.toContain('publicOnly');

    /*
     * Scoped to the timeline. `outcomeStage` still describes the institutional
     * track and still answers `public_only` there, which is correct for what it
     * means — it is reading it as "the reporter chose the public feed" that was
     * wrong, and that reading is what must not come back here.
     */
    const timeline = code(TIMELINE);
    const body = timeline.slice(
      timeline.indexOf('export function ReportOutcomeTimeline'),
      timeline.indexOf('function Step('),
    );
    expect(body).not.toMatch(/public_only/);
    expect(body).not.toMatch(/outcomeStage\(/);
  });
});

describe('which half of the flow applies', () => {
  test('the review step is unconditional — every report is read by an editor', () => {
    /*
     * Including one addressed to named institutions. The destination says who
     * may receive a report, never whether it is reviewed, and the home feed is
     * the editor's alone: nothing reaches Latest or Ghana except by an editor
     * putting it there.
     *
     * Gated on the destination, the step vanished from every directed and
     * marketplace report — telling those reporters their footage went straight
     * from their phone to an organisation.
     */
    const timeline = code(TIMELINE);
    const body = timeline.slice(
      timeline.indexOf('export function ReportOutcomeTimeline'),
      timeline.indexOf('function Step('),
    );
    expect(body).not.toMatch(/const editorial =/);
    // The step is rendered outside any destination test.
    expect(body).not.toMatch(/\{editorial \?/);
    expect(body).toMatch(/<Step\s+icon=\{editorialStep\(vettingState\)\.icon\}/);
  });

  test('only the institutional half turns on the destination', () => {
    /*
     * `recipients.length === 0` is also what a directed report looks like
     * before an editor passes it on, and what any report looks like while its
     * outcome is still loading — which is why this reads the destination.
     */
    expect(code(TIMELINE)).toMatch(/const institutional = destination !== 'public'/);
  });

  test('a directed report that is not routed yet says so, rather than "public feed"', () => {
    const timeline = code(TIMELINE);
    expect(timeline).toMatch(/awaitingRouting = institutional && recipients\.length === 0/);
    expect(timeline).toMatch(/outcome\.notRoutedYetTitle/);
  });

  test('only a `public` submission is told nobody else gets it', () => {
    /*
     * Every other destination offers the report to institutions as well, so the
     * exclusivity sentence there would be the same falsehood reversed.
     */
    expect(code(TIMELINE)).toMatch(/destination === 'public' \? 'bodyPublic' : 'body'/);

    const copy = en.outcome as unknown as {
      editorial: { review: { body: string; bodyPublic: string } };
    };
    expect(copy.editorial.review.bodyPublic).toMatch(/not offered to any organisation/i);
    expect(copy.editorial.review.body).not.toMatch(/not offered to any organisation/i);
  });
});

describe('the record the app reads it from', () => {
  test('the destination is carried on the reporter own report', () => {
    // Verified present on GET /me/incidents against the live service.
    const types = code('types/api.ts');
    expect(types).toMatch(/destination: SubmissionDestination;/);
    expect(types).toMatch(/requestedBusinessIds: string\[\];/);
  });

  test('publishedAt is nullable on the author own view', () => {
    /*
     * It is null for every report still in review, which is most of the ones
     * this screen exists for. Declared as a plain string it rendered a blank
     * timestamp on the tile and an undated "You filed this".
     */
    const types = code('types/api.ts');
    const authored = types.slice(types.indexOf('interface AuthoredIncident'));
    expect(authored.slice(0, 900)).toMatch(/publishedAt: string \| null;/);
    expect(authored.slice(0, 900)).toMatch(/createdAt: string;/);
  });

  test('the screens date a report by when it was filed', () => {
    expect(code('features/profile/ReportGrid.tsx')).toMatch(
      /formatRelativeTime\(report\.createdAt\)/,
    );
    expect(code('features/profile/ReportSheetBody.tsx')).toMatch(
      /filedAtIso=\{report\.createdAt\}/,
    );
  });

  test('every destination in the demo is one the timeline can describe', () => {
    const used = new Set(MY_REPORTS.map((r) => r.destination));
    expect([...used].filter((d) => !SUBMISSION_DESTINATIONS.includes(d))).toEqual([]);
    // And the demo is not all one kind, or neither track is ever seen.
    expect(used.size).toBeGreaterThan(1);
  });

  test('an unpublished demo report carries no publication date', () => {
    const wrong = MY_REPORTS.filter(
      (r) => r.vettingState !== 'published' && r.publishedAt !== null,
    );
    expect(wrong.map((r) => r.id)).toEqual([]);
  });
});

describe('what the reporter is promised before they submit', () => {
  test('no destination claims the report simply goes where it was sent', () => {
    /*
     * "Everyone sees it" was the promise on the public option, made at the
     * moment of choosing; "only the ones you choose receive it" was the promise
     * on the directed one. Both reports then sat in review, and nothing that
     * had been said accounted for the wait — or for the editor who decides.
     */
    const copy = en.destination as unknown as Record<string, { body: string } | undefined>;
    const unreviewed = ['public', 'marketplace', 'directed', 'both'].filter(
      (k) => !/editor/i.test(copy[k]?.body ?? ''),
    );
    expect(unreviewed).toEqual([]);
  });
});
