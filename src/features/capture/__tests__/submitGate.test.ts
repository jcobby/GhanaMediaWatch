import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * What the phone refuses to queue, and why it refuses it there.
 *
 * Two submissions in a row failed in the outbox for reasons the reporter could
 * have fixed in a second at the review screen — and by the time the queue said
 * so, they had left the scene:
 *
 *  - an empty description, which the API rejects outright, surfacing minutes
 *    later as "Request validation failed" with nothing naming the field;
 *  - a zero-byte recording, which produces no chunks, so completion fails with
 *    "Upload is missing chunks" and retries on that message forever.
 *
 * Both are now caught while the reporter is still standing in front of the
 * thing they filmed. Asserted against the source: rendering the review screen
 * needs the camera, the GPS gate and the whole capture store, and what matters
 * is that the gate exists on the path at all.
 */

const CAPTURE = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(CAPTURE, rel), 'utf8');

test('the submit button is disabled while something blocks it', () => {
  const src = read('ReviewScreen.tsx');
  expect(src).toMatch(/disabled=\{blocker !== null\}/);
});

test('an empty description is what blocks it', () => {
  /*
   * The server requires at least one character — verified live: it answers
   * `String must contain at least 1 character(s)` at `description`.
   */
  const src = read('ReviewScreen.tsx');
  expect(src).toMatch(/description\.trim\(\)\.length === 0/);
});

test('the reason is shown, not just the button greyed out', () => {
  /*
   * A disabled button with no explanation is worse than a failure: the reporter
   * presses it, nothing happens, and there is nothing on screen to read.
   */
  const src = read('ReviewScreen.tsx');
  const gate = src.slice(src.indexOf('{/* Submit */}'));
  expect(gate).toMatch(/\{blocker \? \(/);
  expect(gate).toMatch(/\{blocker\}/);
});

test('an empty capture never reaches the queue', () => {
  /*
   * Before the row is written, not after. A queued row pointing at an empty
   * file is the "0 KB / 3 attempts" entry that nothing in the app could
   * explain.
   */
  const src = read('submitCapture.ts');
  const beforeInsert = src.slice(0, src.indexOf('incidentsRepository.insert'));
  expect(beforeInsert).toMatch(/if \(byteSize === 0\)/);
  expect(beforeInsert).toMatch(/throw new Error\('EMPTY_CAPTURE'\)/);
});

test('the empty-capture refusal is put into words for the reporter', () => {
  // `EMPTY_CAPTURE` is a sentinel. Showing it raw would be the app talking to
  // itself in front of the user.
  const src = read('ReviewScreen.tsx');
  expect(src).toMatch(/EMPTY_CAPTURE/);
  expect(src).toMatch(/emptyCaptureTitle/);
  expect(src).toMatch(/emptyCaptureBody/);
});

test('every new message has words', () => {
  const review = en.review as unknown as Record<string, string>;
  const outbox = en.outbox as unknown as Record<string, string>;

  for (const key of ['needDescription', 'emptyCaptureTitle', 'emptyCaptureBody']) {
    expect([key, Boolean(review[key])]).toEqual([key, true]);
  }
  for (const key of ['mediaGone', 'mediaEmpty']) {
    expect([key, Boolean(outbox[key])]).toEqual([key, true]);
  }
});

test('the messages say what to do, not just what is wrong', () => {
  /*
   * "Nothing was recorded" leaves somebody staring at a screen. The next
   * sentence has to be the action — film it again — because at this point the
   * event may still be happening.
   */
  const review = en.review as unknown as Record<string, string>;
  const outbox = en.outbox as unknown as Record<string, string>;

  expect(review.emptyCaptureBody).toMatch(/again/i);
  expect(review.needDescription).toMatch(/add|description/i);
  expect(outbox.mediaEmpty).toMatch(/again/i);
});

test('a stalled empty row is ended rather than retried', () => {
  /*
   * The rows already in somebody's queue. Marked non-retryable so they stop
   * cycling on a message that describes a symptom — "Upload is missing chunks"
   * — rather than the cause.
   */
  const uploader = fs.readFileSync(
    path.resolve(__dirname, '../../../services/uploader.ts'),
    'utf8',
  );
  const guard = uploader.slice(
    uploader.indexOf('if (record.byteSize === 0)'),
    uploader.indexOf('let current = record'),
  );
  expect(guard).toContain('outbox.mediaEmpty');
  expect(guard).toMatch(/retryable: false/);
});

test('the empty-row guard runs before any network call', () => {
  // Otherwise it fails at the server first and the local reason never shows.
  const uploader = fs.readFileSync(
    path.resolve(__dirname, '../../../services/uploader.ts'),
    'utf8',
  );
  expect(uploader.indexOf('if (record.byteSize === 0)')).toBeLessThan(
    uploader.indexOf('api.createIncident'),
  );
});
