import fs from 'fs';
import path from 'path';

/**
 * The app never invents a photograph.
 *
 * `Thumbnail` used to paint one of twelve bundled PNGs under every image
 * unconditionally — a dusk landscape, a soft glow over a hill silhouette,
 * tinted by category — and fade the real picture over it. Three quite different
 * situations therefore looked identical on screen:
 *
 *   - an image still downloading
 *   - a report that has no still at all
 *   - an image whose URL failed
 *
 * And a reader could not tell any of them from a photograph. On this product
 * that is not a matter of taste. Dawuro's claim is that it can say where a file
 * came from and how far anyone has got in checking it; a synthetic landscape
 * sitting in the image slot of a real report quietly breaks that claim, and the
 * person looking at it has no way to know. §4 of the backend spec is the whole
 * product, and this was the interface contradicting it.
 *
 * The three states are now three different things: a pulse while bytes are
 * coming, and a flat category-tinted field with a glyph when none are. Both are
 * unmistakably drawn rather than photographed.
 *
 * **The artwork itself is kept, and that is deliberate.** `src/lib/placeholder.ts`
 * still uses it to stand in for photographs in *fixture* data, where inventing
 * an image is honest because every other field is invented too. The rule is
 * about live reports, not about the files.
 */

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const THUMB = read('components/Thumbnail.tsx');

test('the file under review was read', () => {
  // A rename would empty this file and every assertion below would pass.
  expect(THUMB.length).toBeGreaterThan(1500);
});

test('no live report is drawn over invented scenery', () => {
  /*
   * The specific regression: a `require` of the placeholder artwork back inside
   * the component that renders real reports. `lib/placeholder.ts` may hold
   * these — fixtures are invented end to end — but this component may not.
   */
  expect(THUMB).not.toMatch(/assets\/placeholders/);
  expect(THUMB).not.toMatch(/\bSCENES\b/);
});

test('the three states are distinguishable in the source, not collapsed', () => {
  // `idle` is "the bytes are on their way", which is a different fact from
  // "there is a URL" — the gap between them is the state worth drawing well.
  expect(THUMB).toMatch(/useState<'idle' \| 'loaded'>\('idle'\)/);
  expect(THUMB).toMatch(/onLoad=\{\(\) => setState\('loaded'\)\}/);
  expect(THUMB).toMatch(/onError=\{\(\) => setFailedFor\(sourceId\)\}/);
});

test('a failure is remembered against the source, not the row', () => {
  /*
   * A plain `failed` flag was a latch. A video's still 404s, the flag sticks,
   * and when `lib/videoPoster` finishes cutting a frame from the clip — the
   * whole reason that module exists — the new source is never mounted and the
   * row keeps showing the category field for a report with a real frame ready.
   *
   * Naming which source failed makes the recovery fall out of the render: the
   * poster arriving changes `sourceId`, so the old failure no longer matches.
   * Deliberately not an effect — `setState` inside one is a cascading render
   * and the lint rule rejects it.
   */
  expect(THUMB).toMatch(/const \[failedFor, setFailedFor\]/);
  expect(THUMB).toMatch(/const expecting = source !== null && failedFor !== sourceId/);
  expect(THUMB).toMatch(/poster \? `poster:\$\{cacheKey \?\? ''\}`/);
  expect(THUMB).not.toMatch(/useEffect/);
});

test('loading draws a pulse and nothing that could pass for the picture', () => {
  /*
   * The same language the feed's own skeleton speaks while the list arrives, so
   * waiting for a list and waiting for an image do not look like different
   * kinds of waiting.
   */
  expect(THUMB).toMatch(/const pulsing = \(expecting && state !== 'loaded'\)/);
  expect(THUMB).toMatch(/<Skeleton fill/);
});

test('a frame still being cut is waiting, not "no picture"', () => {
  /*
   * **The state that was missing, and the one most rows on this feed are in.**
   *
   * The service sends no poster for video, so `lib/videoPoster` opens the clip
   * and takes a frame itself — one report at a time, over the network, with an
   * eight-second ceiling each. Until that settles there is no poster and no
   * URL, which this component could only read as "nothing is coming". So a
   * video row drew the finished category field straight away, glyph and all,
   * while work was still going on, and the real frame replaced it seconds
   * later with no warning. Nothing anywhere said the app was busy.
   *
   * `pending` separates "no frame yet" from "no frame at all", and the two
   * expressions below are the whole fix: pulse while one is coming, fall back
   * only once the attempt has settled.
   */
  expect(THUMB).toMatch(/\|\| \(!expecting && pending\)/);
  expect(THUMB).toMatch(/const empty = !expecting && !pending/);
  // Defaulted, so every caller that does not know about posters is unaffected.
  expect(THUMB).toMatch(/pending = false/);
});

test('the pending flag reaches the thumbnail from every list that shows clips', () => {
  /*
   * Four lists render video rows, and a row left out of this is a row that
   * keeps the old silent behaviour. They are checked together because the
   * failure is per-screen and invisible: the feed would pulse correctly while
   * an organisation's inbox went on showing a finished-looking empty field.
   */
  const lists = [
    'features/feed/FeedRow.tsx',
    'features/feed/FeedLead.tsx',
    'features/org/OrgReportRow.tsx',
    'features/profile/ReportGrid.tsx',
  ];
  for (const rel of lists) {
    const src = read(rel);
    expect(src).toMatch(/const \{ poster, pending \} = useVideoPoster\(/);
    expect(src).toMatch(/pending=\{pending\}/);
  }
});

test('"a frame is coming" is a fact the store holds, not one a row guesses', () => {
  /*
   * `peekPoster` returns null three different ways — untried, queued, and
   * tried-and-failed — so no caller can tell them apart from the frame alone.
   * The store knows, because it writes an entry on both terminal paths.
   */
  const lib = read('lib/videoPoster.ts');
  expect(lib).toMatch(/export function posterPending/);
  expect(lib).toMatch(/return !known\.has\(incidentId\)/);

  /*
   * Two subscriptions rather than one snapshot returning an object.
   * `useSyncExternalStore` compares by identity, so a getter that builds
   * `{ poster, pending }` hands back a new object on every check and React
   * re-renders without end.
   */
  const hook = read('hooks/useVideoPoster.ts');
  expect((hook.match(/useSyncExternalStore\(subscribeToPosters/g) ?? []).length).toBe(2);
  expect(hook).toMatch(/return \{ poster, pending \}/);
});

test('an absent image is shown as a drawing, in the category hue', () => {
  /*
   * Flat tint plus the category glyph. The glyph is the part that earns its
   * place: a plain tinted rectangle says only "no picture", while the glyph
   * says what kind of report this is before a word of the headline is read,
   * which is what makes the feed scannable.
   */
  expect(THUMB).toMatch(/function CategoryField/);
  expect(THUMB).toMatch(/categoryHue\(category\)/);
  expect(THUMB).toMatch(/categoryIcon\[category\]/);
  expect(THUMB).toMatch(/const empty = !expecting/);
});

test('a real frame still wins over any fallback', () => {
  /*
   * The service generates no poster for video, so `lib/videoPoster` cuts one
   * from the clip itself. A frame of the thing somebody actually filmed beats
   * both states above, and must be reached before either.
   */
  expect(THUMB).toMatch(/poster \?\? \(isUnrenderable\(uri\) \? null : \{ uri, cacheKey \}\)/);
});

test('the fixture placeholders are still available to fixtures', () => {
  /*
   * Kept, not deleted. Inventing an image inside invented data is honest; doing
   * it under a real report is not. If this ever fails because the artwork was
   * removed, the fixtures lost their images — which is a different bug from the
   * one this file is about.
   */
  const lib = read('lib/placeholder.ts');
  expect(lib).toMatch(/assets\/placeholders/);
  expect(fs.existsSync(path.resolve(SRC, '../assets/placeholders/other.png'))).toBe(true);
});
