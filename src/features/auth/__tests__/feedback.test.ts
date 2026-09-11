import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * Actions that succeed say so.
 *
 * Every one of these screens already announced its *failures* and none of them
 * announced anything else, so the app only ever spoke when something went
 * wrong. Creating an account swapped the screen for the feed with no line, no
 * sound and no shift under the thumb — which is indistinguishable from the app
 * having moved on without you, and the natural response is to go back and try
 * again.
 *
 * These are asserted against the source rather than by rendering, because what
 * matters is that the call is *there* on the success path. A rendered test
 * would need the whole auth stack stood up to prove one line exists.
 */

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const FEATURES = path.resolve(__dirname, '../..');
const readFeature = (rel: string) => fs.readFileSync(path.join(FEATURES, rel), 'utf8');

/** The success path: everything before the `catch`. */
const successPath = (src: string) => src.slice(0, src.indexOf('} catch'));

test('creating an account is acknowledged', () => {
  const src = successPath(read('SignUpScreen.tsx'));
  expect(src).toMatch(/toast\.success\(/);
  expect(src).toMatch(/accountCreatedTitle/);
});

test('signing in is acknowledged, by name', () => {
  /*
   * "Signed in" alone does not say *which* account was reached, and on a shared
   * phone that is the only question worth answering.
   */
  const src = successPath(read('SignInScreen.tsx'));
  expect(src).toMatch(/toast\.success\(/);
  expect(src).toMatch(/displayName/);
});

test('both auth successes are felt as well as read', () => {
  // A toast can be missed while looking at the keyboard; the haptic cannot.
  expect(successPath(read('SignUpScreen.tsx'))).toMatch(/hapticUnlock\(\)/);
  expect(successPath(read('SignInScreen.tsx'))).toMatch(/hapticUnlock\(\)/);
});

test('choosing to report as a guest is acknowledged', () => {
  // The one ending with no form after it to explain itself.
  expect(read('OnboardingScreen.tsx')).toMatch(/toast\.info\([\s\S]{0,80}guestTitle/);
});

test('signing out reassures rather than confirms', () => {
  /*
   * The body carries the weight. Signing out looks like it might discard
   * whatever has not uploaded, and a reporter who believes that will not sign
   * out on a shared phone.
   */
  expect(readFeature('profile/ProfileScreen.tsx')).toMatch(/signedOutTitle/);
  expect(en.auth.signedOutBody).toMatch(/queued|still send/i);
});

test('a report finishing its upload is announced', () => {
  /*
   * The moment the reporter has been waiting for, and it happens in the
   * background — minutes later, on a bus, long after the screen moved on.
   * Without this their last information is "Sending".
   */
  const uploader = fs.readFileSync(
    path.resolve(__dirname, '../../../services/uploader.ts'),
    'utf8',
  );
  expect(uploader).toMatch(/toast\.success\([\s\S]{0,80}outbox\.sentTitle/);
});

test('every new message has words', () => {
  const auth = en.auth as unknown as Record<string, string>;
  const outbox = en.outbox as unknown as Record<string, string>;

  for (const key of [
    'accountCreatedTitle',
    'accountCreatedBody',
    'welcomeBackTitle',
    'welcomeBackBody',
    'signedOutTitle',
    'signedOutBody',
    'guestTitle',
    'guestBody',
  ]) {
    expect([key, Boolean(auth[key])]).toEqual([key, true]);
  }
  expect(Boolean(outbox.sentTitle && outbox.sentBody)).toBe(true);
});

test('the messages say what happens next, not just what happened', () => {
  /*
   * "Account created" is a receipt. "You can now track your reports and see
   * what organisations do about them" is a reason to have made one — and this
   * app's whole argument to a reporter is what happens after they file.
   */
  expect(en.auth.accountCreatedBody).toMatch(/track|see what/i);
  expect(en.auth.guestBody).toMatch(/later|create an account/i);
  expect((en.outbox as unknown as Record<string, string>).sentBody).toMatch(
    /organisations|do about/i,
  );
});
