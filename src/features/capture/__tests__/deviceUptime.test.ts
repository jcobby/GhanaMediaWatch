import fs from 'fs';
import path from 'path';

/**
 * A duration is not a timestamp.
 *
 * `deviceUptimeMs` is a tamper signal: a device clock inconsistent with how
 * long the phone has been switched on is a strong hint the capture time was
 * fabricated. It is one of the inputs the service's integrity check runs on,
 * and integrity decides whether a report is `pending_review` or `restricted` —
 * which decides whether it can ever reach the public feed.
 *
 * Every report this app has ever filed sent the wrong kind of number.
 *
 *     deviceUptimeMs: Math.round(now - (fix.timestamp - now))
 *
 * which is `2 × now − timestamp`. A fresh GPS fix has `timestamp ≈ now`, so it
 * evaluates to **now** — an epoch value around 1.79 × 10¹², handed over as
 * elapsed milliseconds. Every submission claimed the phone had been powered on
 * continuously for about fifty-six years.
 *
 * That is worse than a missing signal. A constant absurdity can never agree
 * with the clock, so the check it feeds can never pass on its account and can
 * never mean anything.
 *
 * Read from source: the value comes from a native module and a wall clock, and
 * what matters is that the expression is not a timestamp again.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note explaining it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const SUBMIT = 'features/capture/submitCapture.ts';

test('the arithmetic that produced an epoch timestamp is gone', () => {
  // The exact expression, so it cannot come back by copy-paste.
  expect(code(SUBMIT)).not.toMatch(/now - \(fix\.timestamp - now\)/);
});

test('the real device uptime is asked for', () => {
  /*
   * `expo-device` measures milliseconds since the last reboot, which is what
   * the field is named after and what the service's check is comparing against.
   */
  const submit = code(SUBMIT);
  expect(submit).toMatch(/from 'expo-device'/);
  expect(submit).toMatch(/Device\.getUptimeAsync\(\)/);
});

test('the fallback is still a duration, never a clock reading', () => {
  /*
   * Where the platform cannot answer, the app's own run time stands in: a real
   * elapsed time and a truthful lower bound on the device's, since the device
   * has certainly been up at least as long as the app.
   *
   * `Date.now()` alone would be the original bug wearing a different name, so
   * the fallback has to be a subtraction from a marker taken at launch.
   */
  const submit = code(SUBMIT);
  expect(submit).toMatch(/const APP_STARTED_AT = Date\.now\(\)/);
  expect(submit).toMatch(/Date\.now\(\) - APP_STARTED_AT/);
});

test('an unavailable module does not stop a report being filed', () => {
  /*
   * A tamper signal is not worth losing a capture over. The reporter is
   * standing in front of the thing; the submission has to survive a module
   * that is missing or unsupported.
   */
  const submit = code(SUBMIT);
  const fn = submit.slice(submit.indexOf('async function deviceUptimeMs'));
  expect(fn.slice(0, 500)).toMatch(/try \{/);
  expect(fn.slice(0, 500)).toMatch(/catch \{/);
});

test('it is read when the report is filed, not when it is finally sent', () => {
  /*
   * The row can sit in the outbox for hours before the phone has signal. Uptime
   * read at upload would describe a moment the reporter had nothing to do with,
   * and would disagree with the capture time it is checked against.
   */
  const submit = code(SUBMIT);
  const filedAt = submit.indexOf('await deviceUptimeMs()');
  const insertAt = submit.indexOf('incidentsRepository.insert');
  expect(filedAt).toBeGreaterThan(-1);
  expect(filedAt).toBeLessThan(insertAt);
});

test('the value still reaches the wire', () => {
  // The whole point is what the service receives.
  expect(code('services/createRequest.ts')).toMatch(/deviceUptimeMs: meta\.deviceUptimeMs/);
  expect(code(SUBMIT)).toMatch(/deviceUptimeMs: uptimeMs/);
});
