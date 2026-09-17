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
  // Everything that has to be true before a report can be sent: a description,
  // and — for a directed report — somebody to send it to.
  expect(src).toMatch(/disabled=\{sendBlocker !== null\}/);
  expect(src).toMatch(/const sendBlocker = blocker \?\? recipientsBlocker;/);
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
  // From step 2 on, where the description is asked for — not over the capture step.
  expect(gate).toMatch(/\{current >= 1 && \(blocker \?\? \(current === 3 \? recipientsBlocker : null\)\) \? \(/);
  expect(gate).toMatch(/\{blocker \?\? recipientsBlocker\}/);
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

describe('filing without an account is a choice, made once, in front of you', () => {
  /*
   * Reporting anonymously is a first-class way to use this app — in a country
   * where the subject of the footage is sometimes the person who would come
   * looking, it is the whole reason some people file at all. So this is not a
   * blocker and not a nag.
   *
   * What a guest is owed is the consequence, before the irreversible step
   * rather than after it: the report reaches the newsroom either way, but
   * nothing can be tracked and nothing can be paid. And the one fact that makes
   * the prompt worth reading — it is still reversible while the report sits in
   * the outbox, because the upload carries whatever identity the phone holds at
   * the moment it goes.
   */
  const review = () => read('ReviewScreen.tsx');

  test('a guest is asked, and somebody signed in is not', () => {
    expect(review()).toMatch(/profile \? void handleSubmit\(\) : setGuestSheet\(true\)/);
  });

  test('the question comes before the report is queued', () => {
    // Afterwards it is an announcement, not a choice: there is no account to
    // attach a report to once it has uploaded under a device identity.
    const source = review();
    expect(source.indexOf('setGuestSheet(true)')).toBeLessThan(
      source.indexOf('void handleSubmit();', source.indexOf('guestSheetSend')),
    );
  });

  test('sending as a guest is offered, not hidden', () => {
    /*
     * Signing in leads because it keeps their options open, but sending stays a
     * full-width control rather than a link underneath. A legitimate decision
     * must not be styled as the wrong answer.
     */
    expect(review()).toMatch(/label=\{t\('review\.guestSheetSend'\)\}/);
    expect(review()).toMatch(/label=\{t\('review\.guestSheetSignIn'\)\}/);
  });

  test('going to sign in does not throw the capture away', () => {
    // Nothing resets until a submission has actually succeeded, so coming back
    // finds the description, the destination and the chosen frame intact.
    const source = review();
    const branch = source.slice(source.indexOf('guestSheetSignIn'));
    expect(branch.slice(0, 400)).not.toMatch(/reset\(\)/);
  });

  test('the words say what is lost and what is still recoverable', () => {
    // `review` also holds a nested `handling` block, so the cast goes
    // through `unknown` rather than claiming every value is a string.
    const copy = en.review as unknown as Record<string, string>;
    expect(copy.guestSheetBody).toBeTruthy();
    expect(copy.guestSheetKeep).toBeTruthy();
    // The two consequences a reporter cannot discover for themselves.
    expect(`${copy.guestSheetBody}`).toMatch(/track|follow/i);
    expect(`${copy.guestSheetBody}`).toMatch(/paid|payment/i);
  });
});
