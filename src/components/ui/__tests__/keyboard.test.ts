import fs from 'fs';
import path from 'path';

/**
 * The keyboard must not cover the thing you are reaching for.
 *
 * Reported on the comment composer: tapping the field raised the keyboard over
 * the field *and* the send button, so you typed blind into a box you could not
 * see with no way to post it. That was not one screen's bug — only the four
 * sign-in screens handled the keyboard at all, and nine others with text input
 * did not.
 *
 * Two separate faults, both invisible until somebody types:
 *
 *   1. Nothing lifted the content, so the bottom of every form sat under the
 *      keyboard.
 *   2. Without `keyboardShouldPersistTaps`, the first tap only dismisses the
 *      keyboard — so every action took two taps and the first looked broken.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Every file that takes typed input and owns its own scroll container. */
const FORMS = [
  'features/capture/ReviewScreen.tsx',
  'features/surveys/SurveyBuilderScreen.tsx',
  'features/org/QueryEditorScreen.tsx',
  'features/earnings/EarningsScreen.tsx',
  'features/auth/SignInScreen.tsx',
  'features/auth/SignUpScreen.tsx',
  'features/auth/ForgotPasswordScreen.tsx',
  'features/organisation/OrganisationSignUpScreen.tsx',
];

test('the files under review exist', () => {
  // A renamed screen would silently empty the rule below.
  for (const rel of FORMS) {
    expect([rel, fs.existsSync(path.join(SRC, rel))]).toEqual([rel, true]);
  }
});

test('every screen that takes typing lifts above the keyboard', () => {
  const unprotected = FORMS.filter((rel) => !read(rel).includes('KeyboardAvoidingView'));
  expect(unprotected).toEqual([]);
});

test('a tap while the keyboard is up reaches the control', () => {
  const swallowing = FORMS.filter((rel) => !read(rel).includes('keyboardShouldPersistTaps'));
  expect(swallowing).toEqual([]);
});

test('scrolling puts the keyboard away', () => {
  /*
   * Reported on the review screen: "getting rid of the keyboard after filling
   * the description, I want to click the add to outbox button."
   *
   * Lifting the content is not enough on a long form. The description is
   * `multiline`, so return has to insert a newline and cannot offer "Done" —
   * and the submit button is a bar pinned to the bottom of the screen, which is
   * where the keyboard is. A reporter who has finished typing has no obvious
   * way out of the field and reads it as being unable to file the report at
   * all.
   *
   * `on-drag` is the gesture people already try. It is on every scrolling form
   * rather than just the one that was reported, because the same trap is set on
   * all of them.
   */
  const stuck = FORMS.filter((rel) => !read(rel).includes('keyboardDismissMode="on-drag"'));
  expect(stuck).toEqual([]);
});

test('the one field with no return key offers a way out', () => {
  // A single-line input can put "Done" on the return key. A multiline one
  // cannot, so the review screen shows the button itself while it has focus.
  const review = read('features/capture/ReviewScreen.tsx');
  expect(review).toMatch(/onFocus=\{\(\) => setDescribing\(true\)\}/);
  expect(review).toMatch(/Keyboard\.dismiss\(\)/);
});

test('sheets handle the keyboard themselves', () => {
  /*
   * A sheet sits at the bottom of the screen, exactly where the keyboard
   * appears, and Android's `adjustResize` does not reach a Modal rendered with
   * `statusBarTranslucent` — so the platform default leaves it covered.
   *
   * Fixed on the component, so the next sheet with a field in it inherits the
   * fix instead of repeating the bug.
   */
  const sheet = read('components/ui/Sheet.tsx');
  expect(sheet).toMatch(/KeyboardAvoidingView/);
  expect(sheet).toMatch(/Platform\.OS === 'ios' \? 'padding' : 'height'/);
});

test('the composer is not fixed in isolation', () => {
  // It is inside a Sheet. A second mechanism here would fight the first.
  expect(read('features/comments/CommentComposer.tsx')).not.toMatch(/KeyboardAvoidingView/);
});
