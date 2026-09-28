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

/*
 * The declaration carries a type annotation now — one slide shows the mark
 * rather than a glyph, so `icon` is optional and the array can no longer be
 * inferred. Anchored on `SLIDES` and whatever sits between it and the `= [`,
 * so an annotation, a generic or a rename of the element type does not
 * silently reduce this to an empty list and pass every assertion below.
 */
const slideKeys = [
  ...(/const SLIDES[^=]*= \[([\s\S]*?)\];/.exec(SCREEN)?.[1] ?? '').matchAll(/key: '(\w+)'/g),
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
   *
   * It used to be `what` — "Film what is happening" — which answers what to
   * *do*, one question further on. A stranger who has just installed something
   * does not yet know what it is called: the name was in `app.json` and in no
   * place a user could see it, while every mark on the screen was the agency's.
   * So the name goes first and the instruction second.
   */
  expect(slideKeys[0]).toBe('dawuro');
  expect(slideKeys[1]).toBe('what');
  // And the slide that introduces the name actually says it.
  expect(copy.dawuro!.title).toMatch(/Dawuro/);
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

test('the app names itself, and names who is behind it', () => {
  /*
   * Two claims, and the app was only making the second. Dawuro is the product;
   * the Ghana News Agency and Softmasters are who provide it. The header used
   * to carry the GNA lockup alone, so the introduction to a stranger never
   * mentioned the name of the thing they had installed.
   *
   * The wordmark is in the header, true on every slide. The credit sits on the
   * opening slide with the agency's own mark beside it, because "Ghana News
   * Agency" in text means less than the mark somebody already recognises.
   */
  expect(SCREEN).toMatch(/<DawuroWordmark/);
  expect(SCREEN).toMatch(/<GnaMark/);
  expect(SCREEN).toMatch(/<ProvidedBy/);
  expect(en.app.providedBy).toMatch(/Ghana News Agency/);
  expect(en.app.providedBy).toMatch(/Softmasters/);
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

describe('getting back', () => {
  /*
   * **Swiping is not enough on its own.** The pager scrolls both ways, but the
   * swipe that feels most natural for "go back" starts at the left edge — which
   * iOS hands to the navigator's own pop gesture. On the first screen of a stack
   * with nothing to pop, that gesture does nothing, and the introduction reads
   * as one-way when it never was.
   *
   * So there is a control, and the dots are controls too: a reader who has just
   * passed something they want to re-read should not have to swipe past it
   * three times to get back to it.
   */
  test('there is a back control, and it is not only a gesture', () => {
    expect(SCREEN).toMatch(/accessibilityLabel=\{t\('common\.back'\)\}/);
    expect(SCREEN).toMatch(/onPress=\{\(\) => goTo\(index - 1\)\}/);
  });

  test('the dots move between slides', () => {
    expect(SCREEN).toMatch(/onPress=\{\(\) => goTo\(i\)\}/);
    // Named, so a screen reader announces the slide rather than "button".
    expect(SCREEN).toMatch(/accessibilityLabel=\{t\(`onboarding\.\$\{slide\.key\}\.title`\)\}/);
  });

  test('one function moves the pager, and it does not also set the index', () => {
    /*
     * `onScroll` is the single owner of which slide is showing. Setting the
     * index inside `goTo` as well would give one fact two owners, and they
     * disagree the moment a scroll is interrupted — the dots saying one thing
     * while the page shows another.
     */
    const goTo = SCREEN.slice(SCREEN.indexOf('const goTo ='), SCREEN.indexOf('const finish ='));
    expect(goTo).toMatch(/scrollTo\(\{ x: clamped \* width/);
    expect(goTo).not.toMatch(/setIndex/);
    // Next uses it too, rather than a second copy of the arithmetic.
    expect(SCREEN).toMatch(/onPress=\{\(\) => goTo\(index \+ 1\)\}/);
  });

  test('leaving the sign-up it opens is not a dead button', () => {
    /*
     * The introduction ends with `router.replace`, so sign-up becomes the root
     * of a stack one entry deep and `router.back()` is a no-op — a chevron that
     * does nothing, on the one path a first-time user takes. Every other route
     * into that screen pushes, which is why it worked everywhere else.
     */
    const signUp = fs.readFileSync(path.resolve(__dirname, '../SignUpScreen.tsx'), 'utf8');
    expect(signUp).toMatch(/leaveOrGoHome\(\)/);
    expect(signUp).not.toMatch(/step === 'kind' \? router\.back\(\)/);

    const helper = fs.readFileSync(
      path.resolve(__dirname, '../../../lib/leaveOrGoHome.ts'),
      'utf8',
    );
    expect(helper).toMatch(/router\.canGoBack\(\)/);
    expect(helper).toMatch(/router\.replace\(fallback\)/);
  });
});

test('the slide about filming warns people not to get hurt doing it', () => {
  /*
   * **This app asks members of the public to film fires, floods, crime and
   * galamsey.** Some of them will walk toward something they should walk away
   * from, and the introduction is read before anyone has opened the camera —
   * which makes it the one place the warning arrives before the decision does.
   *
   * It deliberately echoes `safety.dontRisk` and `safety.emergencyFirst`, the
   * copy `SafetyNotice` shows during the GPS wait at the moment somebody is
   * about to film. Two different wordings of the same rule, in two places,
   * leaves a reader deciding which one the platform meant.
   *
   * "Filming is not help" is the line that has to survive an edit: it is the
   * only sentence in the app that tells somebody to put the phone down.
   */
  const body = copy.what!.body;
  expect(body).toMatch(/danger|risk/i);
  expect(body).toMatch(/112/);
  expect(body).toMatch(/Filming is not help/);

  // And it says it of other people too, not only the reporter.
  expect(body).toMatch(/anyone else|others/i);

  // The capture-time rules still exist; the slide is a reminder, not a
  // replacement for the notice shown when it actually matters.
  const safety = en.safety as unknown as Record<string, string>;
  expect(safety.dontRisk).toMatch(/risk/i);
  expect(safety.emergencyFirst).toMatch(/112/);
});
