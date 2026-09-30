import fs from 'fs';
import path from 'path';

/**
 * The organisation's home does not invent figures.
 *
 * **"0 INBOX" sat above a list containing a report, and had done since the
 * tiles were built.** The client asked `GET /org/dashboard` for `inboxCount`,
 * `publishedCount` and `openAssignments`. That endpoint returns `counts`,
 * `dailyTrend` and `recentHighPriority` — none of those three fields has ever
 * been on the wire. Reading an absent field gave `undefined`, a numeric
 * coercion turned it into `0`, and the tile rendered that as a measurement.
 *
 * Nothing errored, because nothing was wrong from the code's point of view: it
 * asked for a number, it got a number. That is the shape of this whole class of
 * bug — a default that is indistinguishable from an answer.
 *
 * The same wrong assumption cost the licence footer its price. `subscription`
 * is not on `/org/dashboard` either, so it came back null, the plan was
 * unknown, and the screen said "We can't confirm the price on this plan from
 * here" about an organisation that had one. One bad assumption, two symptoms,
 * no error anywhere.
 */

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('a count the service did not give is null, never zero', () => {
  /*
   * The type carries it, so a caller cannot forget. `number` made the bug
   * unreachable by review: every consumer was correct about a value that was
   * never real.
   */
  const types = read('types/org.ts');
  expect(types).toMatch(/inboxCount: number \| null;/);
  expect(types).toMatch(/publishedCount: number \| null;/);
  expect(types).toMatch(/openAssignments: number \| null;/);
});

test('the counters are read from what the endpoint actually returns', () => {
  const http = code('api/http.ts');
  // `counts.byState` is the real shape; the flat fields stay as a fallback for
  // a deployment that sends them, but nothing may assume them.
  expect(http).toMatch(/counts\?\.byState/);
  expect(http).not.toMatch(/inboxCount: count\(res\.inboxCount\)/);
});

test('the plan is fetched from the endpoint that holds it', () => {
  /*
   * `/org/subscription` returns `tier`; `/org/dashboard` does not carry a
   * subscription at all. Without this the licence footer could never state a
   * price, on any organisation, however good its plan.
   */
  const http = code('api/http.ts');
  expect(http).toMatch(/'\/org\/subscription'/);
  expect(http).not.toMatch(/res\.subscription \? normaliseSubscription/);
});

test('one failing request does not blank the other', () => {
  /*
   * Fetched together and caught separately. A dashboard outage must not hide a
   * plan that loaded, and a subscription outage must not empty the counters —
   * a single `await` chain would let either take both down.
   */
  const http = code('api/http.ts');
  expect(http).toMatch(/Promise\.all\(\[/);
  expect((http.match(/\.catch\(\(\) => null\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
});

test('an unknown figure draws as an em dash, not as a number', () => {
  /*
   * The distinction the tile could not show. To somebody deciding whether to
   * open the app, "none waiting" and "we do not know" mean opposite things.
   */
  const screen = code('features/org/OrgInboxScreen.tsx');
  expect(screen).toMatch(/function figure\(value: number \| null \| undefined\): string/);
  expect(screen).toMatch(/typeof value === 'number' \? String\(value\) : '—'/);
  expect(screen).toMatch(/figure\(dashboard\?\.inboxCount\)/);
  expect(screen).toMatch(/figure\(dashboard\?\.publishedCount\)/);
  expect(screen).toMatch(/figure\(dashboard\?\.openAssignments\)/);
  // And the old coercion is gone from all three.
  expect(screen).not.toMatch(/String\(dashboard\.inboxCount\)/);
});
