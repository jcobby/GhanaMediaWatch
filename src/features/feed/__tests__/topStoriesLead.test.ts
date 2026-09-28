import fs from 'fs';
import path from 'path';

/**
 * The front page runs the editor's order, not the clock's.
 *
 * "Top stories" are the slides at the head of the mobile feed, and they are set
 * on the console's Leading desk — an editor pins a report and it leads. The
 * phone computed them as `visible.slice(0, topStoryCount)` instead: the newest
 * N reports, full stop. So every pin an editor made was silently overruled by
 * whatever had arrived since, and the desk that exists to run the front page
 * changed nothing on it.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the lead flag reaches the phone', () => {
  // `PublicIncident.lead` is on the wire — "true only while the editorial lead
  // pin is active (false if expired)" — and was absent from the client's type,
  // so nothing could read it.
  expect(code('types/api.ts')).toMatch(/lead\?: boolean;/);
  // Defaulted to false: a service that omits it means "not led", and the other
  // way round would put an arbitrary report at the top of the front page.
  expect(code('api/http.ts')).toMatch(/lead: raw\.lead === true/);
});

test('pinned stories lead, and the newest only fill the rest', () => {
  const feed = code('features/feed/FeedScreen.tsx');
  expect(feed).toMatch(/\.filter\(\(incident\) => incident\.lead\)/);
  // Most recently pinned first — the order an editor builds a running order in.
  expect(feed).toMatch(/\(b\.leadAt \?\? ''\)\.localeCompare\(a\.leadAt \?\? ''\)/);
  // The old rule, which ignored the editor entirely.
  expect(feed).not.toMatch(/visible\.slice\(0, topStoryCount\)/);
});

test('a led story is not also repeated in the list below it', () => {
  /*
   * `rows` was `visible.slice(leading.length)` — correct only while the leads
   * were the first N. A pin can come from anywhere in the feed, so dropping a
   * prefix would show it twice and hide an unrelated report behind it.
   */
  const feed = code('features/feed/FeedScreen.tsx');
  expect(feed).toMatch(/const led = new Set\(leading\.map\(\(incident\) => incident\.id\)\)/);
  expect(feed).not.toMatch(/visible\.slice\(leading\.length\)/);
});
