import fs from 'fs';
import path from 'path';

/**
 * Media the app can actually fetch.
 *
 * A published photo showed the bundled category artwork in the feed and a black
 * rectangle on the detail screen. Both read as missing media. The file was on
 * the server the whole time — `GET /v1/media/{id}` returns 200, `image/jpeg`,
 * 1.5 MB — and the app was asking for it at no address at all.
 *
 * Two faults, one appearance:
 *
 *   1. `media.url` arrives **relative** (`/v1/media/{id}?exp=…&sig=…`) and
 *      nothing made it absolute. `expo-image` cannot resolve that and fails
 *      silently — no error, no broken-image state.
 *   2. `media.posterUrl` is null for everything the service stores, including
 *      photos, where the photo is already at `media.url`. Every thumbnail reads
 *      `posterUrl`, so a real report fell through to the category scene.
 *
 * Both are fixed at the boundary, in `normaliseIncident`, rather than in the
 * feed row and the slides viewer and the next screen to read it.
 */

const src = () => fs.readFileSync(path.resolve(__dirname, '../http.ts'), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = () =>
  src()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('media urls are made absolute at the boundary', () => {
  const s = code();
  expect(s).toMatch(/function absoluteMedia/);
  const normalise = s.slice(s.indexOf('function normaliseIncident'));
  expect(normalise.slice(0, 2000)).toMatch(/url: absoluteMedia\(raw\.media\.url\)/);
});

test('a photo is its own poster', () => {
  const poster = code().slice(code().indexOf('function posterFor'));
  expect(poster.slice(0, 400)).toMatch(/kind === 'photo'\) return poster \|\| media\.url/);
});

test('a video keeps no poster, so the category scene shows instead', () => {
  /*
   * There is genuinely no still frame for a clip. `Thumbnail` drawing the
   * bundled scene is the right answer there — better than a frame that cannot
   * paint.
   *
   * And the service does not leave that to inference: for a video it echoes the
   * media URL back as `posterUrl`, so taking the field at face value hands the
   * MP4 to `expo-image` in every feed row — several megabytes pulled down a
   * mobile connection to arrive at the category scene anyway, because that is
   * the one thing `expo-image` cannot decode.
   */
  const poster = code().slice(code().indexOf('function posterFor'));
  expect(poster.slice(0, 400)).toMatch(/poster === media\.url \? '' : poster/);
});

test("the reporter's own reports are normalised like everyone else's", () => {
  /*
   * `getMyIncidents` used to spread the raw record back over the normalised one
   * — `{ ...normaliseIncident(raw), ...raw }` — which keeps nothing that
   * `normaliseIncident` was not already keeping (it spreads `raw` first) and
   * undoes every correction. `/me/incidents` returns the same relative
   * `media.url` as the public feed, so a reporter opening their own report
   * handed a path with no host to the downloader and to `expo-image`, and was
   * told the footage could not be opened.
   */
  const s = code();
  const fn = s.slice(s.indexOf('async getMyIncidents'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  expect(body).toMatch(/normaliseIncident\(raw\)/);
  expect(body).not.toMatch(/\.\.\.raw/);
});

test('an absolute url is left alone, and the signature is never stripped', () => {
  /*
   * The signature is the authorisation. Dropping the query gives 403 "Media URL
   * signature is missing or expired", which is a different failure that looks
   * identical on screen.
   */
  const fn = code().slice(code().indexOf('function absoluteMedia'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  expect(body).toMatch(/\^https\?:/);
  expect(body).not.toMatch(/split\('\?'\)|replace\(\/\\?\.\*\//);
});

test('an empty url does not become the bare origin', () => {
  /*
   * Concatenating an origin onto nothing produces a URL that resolves to the
   * API root — an <Image> pointed at a JSON 404, which paints nothing and
   * reports nothing.
   */
  const fn = code().slice(code().indexOf('function absoluteMedia'));
  expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/if \(!url\) return ''/);
});
