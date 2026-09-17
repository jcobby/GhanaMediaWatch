import fs from 'fs';
import path from 'path';

/**
 * The reporter chooses which second of their clip stands for it.
 *
 * Without this the app takes a frame one second in and nobody has a say. That
 * is a fair guess and often a poor picture — the operator is still raising the
 * phone, or what they are reporting has not come into shot. The person who
 * filmed it knows which moment shows the thing, and the review screen is the
 * last place they are still holding the file.
 *
 * The whole feature is built around one fact: **the recording is on the phone.**
 * Cutting frames from local storage costs nothing, which is why the strip can
 * offer four of them, and why the chosen frame is taken at the end of the
 * upload rather than downloaded back afterwards.
 *
 * Read from source. These are camera and player calls that need a device.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the choice is offered for footage and not for a photograph', () => {
  // A photograph is already its own thumbnail; a strip of frames from one
  // would be four copies of the same picture.
  expect(code('features/capture/ReviewScreen.tsx')).toMatch(
    /pending\.kind === 'video' \? \(\s*<PosterPicker/,
  );
});

test('the candidate frames come from the local file', () => {
  /*
   * The point of doing this here. Anywhere later means a signed URL, a range
   * request and a wait; here it is a seek against storage.
   */
  const picker = code('features/capture/PosterPicker.tsx');
  // The local file, with a setup that keeps the player silent.
  expect(picker).toMatch(/useVideoPlayer\(uri, \(instance\) =>/);
  expect(picker).toMatch(/generateThumbnailsAsync\(/);
});

test('the offsets skip the start and the end of the clip', () => {
  /*
   * The first frame is usually the phone being raised and the last is usually
   * it being lowered, so both are the least representative moments in the file.
   */
  const picker = code('features/capture/PosterPicker.tsx');
  expect(picker).toMatch(/durationMs \* 0\.8/);
  expect(picker).toMatch(/durationMs \* 0\.1/);
});

test('a clip that cannot be read shows nothing rather than four grey boxes', () => {
  const picker = code('features/capture/PosterPicker.tsx');
  expect(picker).toMatch(/setFrames\(\[\]\)/);
  expect(picker).toMatch(/frames !== null && frames\.length === 0\) return null/);
});

test('the choice survives the app being closed', () => {
  /*
   * An upload can happen hours later, in another town, after the app has been
   * killed — so the choice lives on the queued row rather than in memory, where
   * it would quietly evaporate before the frame was ever cut.
   */
  expect(code('db/schema.ts')).toMatch(/posterAtMs: integer\('poster_at_ms'\)/);
  expect(code('features/capture/submitCapture.ts')).toMatch(
    /posterAtMs: capture\.kind === 'video'/,
  );
});

test('the column reaches phones that already ran the old build', () => {
  /*
   * `CREATE TABLE IF NOT EXISTS` does nothing to a table that exists, so a new
   * column is missing on every device that ran the previous version — and it
   * fails at insert time, on a reporter's phone, after they have filmed
   * something. Three columns had already drifted this way.
   */
  expect(code('db/client.ts')).toMatch(/\['poster_at_ms', 'INTEGER'\]/);
  expect(code('db/client.ts')).toMatch(/poster_at_ms INTEGER/);
});

test('a new capture does not inherit the last one’s frame', () => {
  // It would point at a moment of a recording that is no longer being filed.
  expect(code('stores/captureStore.ts')).toMatch(/set\(\{ pending, posterAtMs: null \}\)/);
});

describe('the frame is taken while the footage is still on the phone', () => {
  const uploader = () => code('services/uploader.ts');

  test('after the report has an id, before its file is deleted', () => {
    /*
     * The only moment both facts exist. Earlier there is no id to key the
     * thumbnail by; later the recording has been reclaimed and the only copy is
     * the one the device just finished uploading.
     */
    const source = uploader();
    // The call, not the import at the top of the file.
    const cut = source.indexOf('await adoptLocalPoster(');
    const remove = source.indexOf('deleteMedia(mediaUri)');
    expect(cut).toBeGreaterThan(source.indexOf('completeUpload'));
    expect(cut).toBeLessThan(remove);
  });

  test('it is awaited, because the next line removes the file it reads', () => {
    expect(uploader()).toMatch(/await adoptLocalPoster\(/);
  });

  test('the choice is read from the database, not from the queue record', () => {
    // A resumed upload never builds the metadata object, and `OutboxRecord`
    // does not carry it either.
    expect(uploader()).toMatch(/incidentsRepository\.findPosterChoice\(current\.id\)/);
  });

  test('a thumbnail that could not be cut does not fail the upload', () => {
    /*
     * This runs at the end of a successful send. Throwing here would tell a
     * reporter their report did not go through, about a picture.
     */
    const poster = code('lib/videoPoster.ts');
    const adopt = poster.slice(poster.indexOf('export async function adoptLocalPoster'));
    expect(adopt).toMatch(/catch \{/);
    expect(adopt).toMatch(/player\.release\(\)/);
  });
});
