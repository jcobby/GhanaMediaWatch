import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * The introduction a first-time user actually sees.
 *
 * It used to open on "Verified location, every time" — an answer to a question
 * nobody has yet. Somebody who has just installed this does not want to know
 * how the GPS gate works; they want to know what the app is, what happens to
 * what they send, and whether they get anything for it. Only then do the
 * mechanics mean something.
 *
 * The mechanics slides still earn their place: a camera that refuses to open
 * and a report that appears not to send are both complaints the app would
 * otherwise receive, and both are cheaper to pre-empt than to answer.
 */

const SCREEN = fs.readFileSync(path.resolve(__dirname, '../OnboardingScreen.tsx'), 'utf8');

const slideKeys = [
  ...(/const SLIDES = \[([\s\S]*?)\];/.exec(SCREEN)?.[1] ?? '').matchAll(/key: '(\w+)'/g),
].map((m) => m[1]!);

const copy = en.onboarding as unknown as Record<string, { title: string; body: string }>;

test('the scan found the slides', () => {
  expect(slideKeys.length).toBeGreaterThan(3);
});

test('every slide has a title and a body', () => {
  // A missing key renders the raw path — `onboarding.what.title` — on the very
  // first screen anybody sees.
  const broken = slideKeys.filter((k) => !copy[k]?.title || !copy[k]?.body);
  expect(broken).toEqual([]);
});

test('it opens by saying what the app is', () => {
  /*
   * Order is the content here. The first slide is the only one a large share of
   * people will read before skipping, so it has to carry the answer to "what is
   * this", not a detail about location accuracy.
   */
  expect(slideKeys[0]).toBe('what');
});

test('the promise and the payment come before the mechanics', () => {
  const reaches = slideKeys.indexOf('reaches');
  const earn = slideKeys.indexOf('earn');
  const anonymous = slideKeys.indexOf('anonymous');

  expect(reaches).toBeGreaterThan(-1);
  expect(earn).toBeGreaterThan(-1);
  expect(reaches).toBeLessThan(anonymous);
  expect(earn).toBeLessThan(anonymous);
});

test('the reporter is told they are paid, and that filing is free', () => {
  // Both halves matter. "You earn" without "filing is free" reads to somebody
  // deciding whether to install as though it might cost them something.
  expect(copy.earn!.body).toMatch(/commission|earn/i);
  expect(copy.earn!.body).toMatch(/free/i);
});

test('the outcome promise names real institutions', () => {
  /*
   * "Your report is routed to relevant organisations" is a sentence about
   * software. Naming the Assembly and NADMO is a sentence about Accra, and it
   * is the one that makes the promise legible.
   */
  expect(copy.reaches!.body).toMatch(/Assembly|NADMO|utility/);
});

test('anonymity is explained with its limit, not just offered', () => {
  // Offering anonymity without saying what is still recorded is the kind of
  // half-truth that costs a platform its credibility exactly once.
  expect(copy.anonymous!.body).toMatch(/device|identifier|abuse/i);
});

test('the agency is named on the introduction', () => {
  /*
   * Who stands behind the app is the strongest thing it has to say to a
   * stranger being asked to film something and hand it over. It lives in the
   * header, so it is true on every slide rather than on one.
   */
  expect(SCREEN).toMatch(/<GnaHorizontal/);
});

/**
 * How the introduction ends.
 *
 * Three routes, all visible at once: create an account, sign in to an existing
 * one, or start reporting without either. Ordered by what a fresh install most
 * likely wants — but none of them hidden, because burying "continue without an
 * account" behind a skip link would contradict the slide that just promised
 * anonymous reporting works.
 */
describe('the choice at the end', () => {
  test('creating an account opens the sign-up screen', () => {
    /*
     * The button said "Create an account" and opened `/(auth)/sign-in`, so
     * every new user was sent to a form they had no credentials for. It reads
     * as the app losing their tap.
     */
    const createBlock = /onboarding\.createAccount[\s\S]{0,240}?finish\('([^']+)'\)/.exec(SCREEN);
    expect(createBlock?.[1]).toBe('/(auth)/sign-up');
  });

  test('an existing account can sign in from the intro', () => {
    const signInBlock = /onboarding\.haveAccount[\s\S]{0,240}?finish\('([^']+)'\)/.exec(SCREEN);
    expect(signInBlock?.[1]).toBe('/(auth)/sign-in');
  });

  test('reporting without an account is still offered', () => {
    // The product's premise. If this disappears, anonymity became a claim the
    // first screen already contradicts.
    /*
     * Searched in a window around the label rather than forward from it: this
     * control is a Pressable whose `onPress` is declared before its
     * `accessibilityLabel`, so a forward-only match finds nothing and the test
     * fails on its own regex rather than on the code.
     */
    const at = SCREEN.indexOf('onboarding.continueWithout');
    const window = SCREEN.slice(Math.max(0, at - 300), at + 300);
    expect(/finish\('\/\(tabs\)'\)/.test(window)).toBe(true);
  });

  test('all three routes are distinct', () => {
    const routes = [...SCREEN.matchAll(/finish\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(new Set(routes).size).toBeGreaterThanOrEqual(3);
  });

  test('every ending has words', () => {
    for (const key of ['createAccount', 'haveAccount', 'continueWithout']) {
      const copy = (en.onboarding as unknown as Record<string, string>)[key];
      expect([key, Boolean(copy)]).toEqual([key, true]);
    }
  });
});
