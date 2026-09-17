import fs from 'fs';
import path from 'path';

/**
 * The feed says which organisation a report is from.
 *
 * A report an organisation released is credited to it, and until now that
 * credit appeared only on the report's own screen. In the feed — where a reader
 * decides what to open — a report from a named institution looked exactly like
 * one a citizen filed.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('a feed row names the organisation first', () => {
  const row = code('features/feed/FeedRow.tsx');
  expect(row).toMatch(/incident\.publisher\.kind === 'organisation'/);
  expect(row).toMatch(/\{source \? \(/);
});

test('the top story names it too', () => {
  const lead = code('features/feed/FeedLead.tsx');
  expect(lead).toMatch(/incident\.publisher\.kind === 'organisation' \? \(/);
  expect(lead).toMatch(/incident\.publisher\.displayName/);
});

test('a report with no publisher cannot crash a desk', () => {
  /*
   * The Africa desk became an error screen: a report arrived without
   * `publisher`, and the row read `publisher.kind`. The boundary now fills it
   * in, so every screen that reads it is safe.
   */
  expect(code('api/http.ts')).toMatch(/publisher: raw\.publisher \?\? \{ kind: 'anonymous' as const \}/);
});

test('switching desk starts the top stories from the first one', () => {
  expect(code('features/feed/FeedScreen.tsx')).toMatch(
    /<TopStories\s+key=\{section \?\? 'latest'\}/,
  );
});

test('a citizen report is not given an organisation it does not have', () => {
  // Only the organisation branch of the publisher union carries a name to show.
  expect(code('features/feed/FeedRow.tsx')).toMatch(
    /kind === 'organisation'\s*\?\s*\{ name: incident\.publisher\.displayName/,
  );
});
