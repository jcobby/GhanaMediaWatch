import fs from 'fs';
import path from 'path';

/**
 * Why every picture in the app loaded slowly, every single time.
 *
 * Reported as "the pictures load slowly both mobile and web". Three separate
 * causes, none of them the network:
 *
 *   1. **Nothing was ever cached.** Media URLs are signed — `/v1/media/{id}
 *      ?exp=…&sig=…` — with a fresh deadline, and therefore a fresh signature,
 *      on every API response. `expo-image` keys its cache on the URL unless
 *      told otherwise, so the same photograph arrived under a different key
 *      each time and was downloaded again from nothing. Closing and reopening
 *      the app re-fetched the entire feed.
 *
 *   2. **A thumbnail was the full-resolution original.** There are no
 *      derivatives: `posterUrl` for a photo is the photo, at capture
 *      resolution. A 112×86 feed row and a one-third-width grid tile each pull
 *      several megabytes to draw a stamp.
 *
 *   3. **The profile grid downloaded videos in order to fail.** Its fallback
 *      was `posterUrl || url`, and for a clip that is the clip. Twelve tiles
 *      fetched twelve whole recordings so `expo-image` could decline to decode
 *      each one and leave the tile grey — the reporter paying for every
 *      megabyte of their own footage to be shown nothing.
 *
 * 1 and 3 are fixed here and are rules below. 2 is the server's to fix and is
 * item 6 in BACKEND-REQUESTS; nothing on the phone can make an original
 * smaller than it is.
 */

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** Every screen that draws report media through the shared thumbnail. */
const CALLERS = [
  'features/feed/FeedRow.tsx',
  'features/feed/FeedLead.tsx',
  'features/feed/SlidesViewer.tsx',
  'features/profile/ReportGrid.tsx',
  'features/organisations/OrganisationProfileScreen.tsx',
];

test('the files under review exist', () => {
  // A renamed screen would silently empty the rules below.
  for (const rel of CALLERS) {
    expect([rel, fs.existsSync(path.join(SRC, rel))]).toEqual([rel, true]);
  }
});

test('an image is cached under a name its signature cannot change', () => {
  expect(code('components/Thumbnail.tsx')).toMatch(/\{ uri, cacheKey \}/);
});

test('every caller passes one', () => {
  /*
   * A missing key is not an error and not visible — it is the old behaviour,
   * silently: that screen alone re-downloads everything forever.
   */
  const missing = CALLERS.filter((rel) => !/cacheKey=\{/.test(code(rel)));
  expect(missing).toEqual([]);
});

test('the key is the report, not the URL', () => {
  // Anything derived from `media.url` carries the signature and defeats itself.
  for (const rel of CALLERS) {
    expect([rel, /cacheKey=\{(?:incident|report)\.id\}/.test(code(rel))]).toEqual([rel, true]);
  }
});

test('a recycled row does not draw the previous report', () => {
  /*
   * Rows are reused as the list scrolls. Without `recyclingKey` the view keeps
   * showing the last report's picture until the new one decodes, so a fast
   * scroll pairs the wrong photograph with the right headline.
   */
  expect(code('components/Thumbnail.tsx')).toMatch(/recyclingKey=\{cacheKey\}/);
});

test('a decoded image is kept in memory too', () => {
  // The default keeps only the file, so scrolling back up re-decodes every
  // image already drawn — cheap next to a download, but it is the stutter.
  expect(code('components/Thumbnail.tsx')).toMatch(/cachePolicy="memory-disk"/);
});

test('no screen hands a video to an image view', () => {
  /*
   * The profile grid's `posterUrl || url` fallback, which cost the reporter
   * their own footage in download for a grey square. `Thumbnail` is the only
   * correct answer: it draws the category scene, it can cut a frame from the
   * clip, and it never asks an image decoder for an MP4.
   */
  const grid = code('features/profile/ReportGrid.tsx');
  expect(grid).not.toMatch(/posterUrl \|\| report\.media\.url/);
  expect(grid).toMatch(/<Thumbnail/);
});
