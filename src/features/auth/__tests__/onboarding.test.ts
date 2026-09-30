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

test('anonymity is explained with its limit, where somebody is about to rely on it', () => {
  /*
   * **The limit moved; it was not dropped.** The introduction used to carry
   * "a device identifier is still recorded so abuse can be traced — we will not
   * pretend otherwise", and now says "Publish without registering. We protect
   * your identity."
   *
   * That promise is only safe because the qualification is still made, at the
   * moment it actually bears on a decision: `review.anonymitySheetDevice`, on
   * the sheet shown when somebody files anonymously. A caveat read once during
   * an introduction and a caveat read while choosing to file anonymously are
   * not the same caveat, and the second is the one that matters.
   *
   * So this now guards the sheet rather than the slide. If the disclosure ever
   * leaves `ReviewScreen` too, the app is making a privacy promise it does not
   * keep — which is what this test exists to prevent, and the reason it is
   * pointed at the copy *and* at the screen that renders it.
   */
  const limit = (en.review as unknown as Record<string, string>).anonymitySheetDevice;
  expect(limit).toMatch(/device|identifier|abuse/i);
  expect(limit).toMatch(/not untraceable|not overstate/i);

  const review = fs.readFileSync(
    path.resolve(__dirname, '../../capture/ReviewScreen.tsx'),
    'utf8',
  );
  expect(review).toMatch(/t\('review\.anonymitySheetDevice'\)/);
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
  /*
   * Four separate strings, because each label sits on its own line beside that
   * organisation's logo and a single sentence cannot hold that.
   *
   * Both labels are capitalised. They read as two lines of a credit rather
   * than as one sentence wrapped, so a lowercase "powered by" under a capital
   * "Sponsored by" looked like a continuation that had lost its first half.
   *
   * The two names stay pinned even though neither is drawn as text any more —
   * the accessibility label still reads the whole credit aloud, and that is
   * the only place a screen reader hears who stands behind the app.
   */
  expect(en.app.gna).toBe('GNA');
  expect(en.app.softmasters).toBe('Softmasters');
  expect(en.app.sponsoredBy).toBe('Sponsored by');
  expect(en.app.poweredBy).toBe('Powered by');
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
    // Through `goToManually`, which also stops the automatic pacing — see
    // "the introduction reads itself" below.
    expect(SCREEN).toMatch(/onPress=\{\(\) => goToManually\(index - 1\)\}/);
  });

  test('the dots move between slides', () => {
    expect(SCREEN).toMatch(/onPress=\{\(\) => goToManually\(i\)\}/);
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
    // Next uses it too, rather than a second copy of the arithmetic — via
    // `goToManually`, which wraps it and stops the timer.
    expect(SCREEN).toMatch(/onPress=\{\(\) => goToManually\(index \+ 1\)\}/);
    expect(SCREEN).toMatch(/const goToManually = \(i: number\) => \{[\s\S]{0,120}goTo\(i\);/);
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

test('each provider is named in bold with its own mark beside it', () => {
  /*
   * The credit used to be one sentence with the names bolded inside it, and a
   * row of two lockups underneath. The lockups have moved into the line: a mark
   * sits directly against the name it belongs to, which is what makes it read
   * as a credit to two organisations rather than as a caption above a logo bar.
   *
   * Laid out as flex rows rather than as images nested in `<Text>`. React
   * Native permits the nesting, and it is the obvious way to write it, but the
   * image's vertical alignment is fixed to the text baseline and cannot be
   * nudged — a square mark sits low against lowercase type. A row lets every
   * piece centre on the same line.
   */
  const brand = fs.readFileSync(path.resolve(__dirname, '../../../components/Brand.tsx'), 'utf8');
  /*
   * The agency's *logo*, not its symbol.
   *
   * `GnaMark` is the gong-gong, which Dawuro borrows as its own mark and shows
   * at 176pt at the top of this very slide. Crediting the agency with it put
   * the same drums on one screen twice and read as the app crediting itself.
   * The wordmark is the agency's identity and has no drums in it.
   */
  expect(brand).toMatch(/<GnaWordmark height=\{gnaLogo\} \/>/);
  /*
   * And Softmasters' full lockup, not its grid mark.
   *
   * The mark carries no lettering, so the name had to be typed beside it in
   * Inter Bold — putting "Softmasters" in a different face from its own logo,
   * on the line directly under one where the agency appeared as artwork only.
   * Two names, two treatments, and the pair stopped reading as one credit.
   */
  expect(brand).toMatch(/<SoftmastersLogo height=\{softmastersLogo\} \/>/);
  /*
   * Two rows, one organisation each, sharing one row style.
   *
   * A single wrapping row broke wherever the width ran out — "Sponsored by GNA
   * powered by" then "Softmasters" alone — which separated a mark from the
   * name it belongs to. One shared `row` rather than two style objects, so the
   * two lines cannot drift apart the way they did when each was written out.
   */
  expect((brand.match(/<View style=\{row\}>/g) ?? []).length).toBe(2);
  expect(brand).toMatch(/const row = \{/);

  /*
   * Words before artwork, in both rows.
   *
   * The mark used to sit between "Sponsored by" and "GNA", interrupting the
   * phrase it illustrates. Order is the whole point of this line, so it is
   * asserted rather than left to a reading of the file.
   */
  const sponsored = brand.indexOf("t('app.sponsoredBy')", brand.indexOf('const row'));
  const gnaLogo = brand.indexOf('<GnaWordmark height={gnaLogo}');
  expect(sponsored).toBeGreaterThan(0);
  expect(gnaLogo).toBeGreaterThan(sponsored);

  const powered = brand.indexOf("t('app.poweredBy')", brand.indexOf('const row'));
  const smLogo = brand.indexOf('<SoftmastersLogo height={softmastersLogo}');
  expect(powered).toBeGreaterThan(0);
  expect(smLogo).toBeGreaterThan(powered);

  /*
   * Neither name is typed beside a logo that already sets it.
   *
   * Both lockups are lettering: the agency's reads GNA / GHANA NEWS AGENCY,
   * Softmasters' reads SOFTMASTERS / BUSINESS SOLUTIONS. Setting either name
   * again in Inter Bold is the word twice, inches apart, in two faces — and
   * doing it on one row but not the other is what stopped the pair reading as
   * one credit at all.
   *
   * Both keys stay in use by the accessibility label, which reads the credit
   * as one sentence and so must still say both names aloud.
   */
  const rows = brand.slice(brand.indexOf('const row'));
  expect(rows).not.toMatch(/<RNText style=\{name\}>/);
  /*
   * The label is a ternary now, because the launch screen renders only the
   * build credit — GNA's full lockup is already the largest thing on that
   * screen, so crediting it again underneath was the same organisation twice
   * in one glance. The label has to follow what is drawn: telling a screen
   * reader about a sponsor line that is not on the page is worse than the
   * duplication it was added to avoid.
   *
   * The introduction keeps both, and that branch is what this pins.
   */
  expect(brand).toMatch(
    /`\$\{t\('app\.sponsoredBy'\)\} \$\{t\('app\.gna'\)\}, \$\{t\('app\.poweredBy'\)\} \$\{t\('app\.softmasters'\)\}`/,
  );
  expect(brand).toMatch(/: `\$\{t\('app\.poweredBy'\)\} \$\{t\('app\.softmasters'\)\}`/);
  expect(SCREEN).not.toMatch(/credits=/);

  /*
   * Spacing as a number, not `gap-x-1.5`.
   *
   * That class compiled to nothing — no other row in the app uses the `gap-x-`
   * form, and NativeWind builds the stylesheet from the class names it finds,
   * so there was no rule to apply. The credit shipped as "Sponsored by▪GNA"
   * with the mark against the words on both sides, and nothing errored.
   */
  // Comments stripped first: the block explaining *why* `gap-x-` went names it,
  // and a rule that reads its own rationale as a violation fails on prose.
  const brandCode = brand.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  expect(brandCode).not.toMatch(/gap-x-/);
  expect(brandCode).toMatch(/const gutter = Math\.round\(size \* 0\.42\)/);

  /*
   * A named face, and one `_layout.tsx` actually loads.
   *
   * This used to pin `Inter_700Bold`, which the typed company names were set
   * in. Both names are artwork now, so the only type left in this component is
   * the two labels — but the rule behind the assertion is unchanged and still
   * worth holding: React Native cannot synthesise weight for a named family,
   * so a `fontWeight` here would be ignored on Android and unreliable on iOS,
   * and a face the layout never registers falls back to the system font
   * silently, with no error anywhere.
   */
  expect(brand).toMatch(/fontFamily: 'Inter_500Medium' as const/);
  expect(brandCode).not.toMatch(/fontWeight:/);
  const layout = fs.readFileSync(path.resolve(__dirname, '../../../app/_layout.tsx'), 'utf8');
  expect(layout).toMatch(/Inter_500Medium/);

  // One label for a screen reader, rather than four fragments read in sequence.
  // A ternary now — see the note above on why the launch screen drops the
  // sponsor line — so this pins the attribute, and the branches are pinned
  // separately.
  expect(brand).toMatch(/accessibilityLabel=\{\s*credits === 'both'/);
});

describe('the introduction reads itself', () => {
  test('each slide holds for five seconds', () => {
    expect(SCREEN).toMatch(/const AUTO_ADVANCE_MS = 5000;/);
    expect(SCREEN).toMatch(/setTimeout\(\(\) => goTo\(index \+ 1\), AUTO_ADVANCE_MS\)/);
  });

  test('the clock restarts per slide rather than running free', () => {
    /*
     * Keyed on `index`. A single interval drifts out of step the moment a
     * scroll takes longer than it does, and then starts skipping slides — the
     * timer fires while the previous animation is still settling.
     */
    expect(SCREEN).toMatch(/\}, \[autoAdvance, isLast, reducedMotion, index, goTo\]\)/);
  });

  test('it stops on the last slide, where a choice is waiting', () => {
    // Sliding away from three buttons while somebody is deciding between them
    // is worse than a screen that waits.
    expect(SCREEN).toMatch(/if \(!autoAdvance \|\| isLast \|\| reducedMotion\) return;/);
  });

  test('any deliberate move hands the pacing over for good', () => {
    /*
     * A carousel that keeps advancing under a reader's thumb is the most
     * irritating version of this: they swipe back to re-read something and it
     * slides away again five seconds later.
     */
    expect(SCREEN).toMatch(/onScrollBeginDrag=\{\(\) => setAutoAdvance\(false\)\}/);
    expect(SCREEN).toMatch(/const goToManually = \(i: number\) => \{\s*setAutoAdvance\(false\);/);
    // Back, Next and the dots all go through it; nothing calls `goTo` directly.
    expect(SCREEN).toMatch(/goToManually\(index - 1\)/);
    expect(SCREEN).toMatch(/goToManually\(index \+ 1\)/);
    expect(SCREEN).toMatch(/goToManually\(i\)/);
    expect(SCREEN).not.toMatch(/onPress=\{\(\) => goTo\(/);
  });

  test('a reader who asked for less motion gets none', () => {
    // An animation nobody asked for is exactly what that system setting is
    // about, and this one moves the whole screen.
    expect(SCREEN).toMatch(/const reducedMotion = useReducedMotion\(\)/);
  });
});
