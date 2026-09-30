import fs from 'fs';
import path from 'path';

/**
 * Tapping a search result opens the report.
 *
 * **The bug, which was invisible in every way a bug can be.** Search moved from
 * a magnifier in the masthead into the tab bar, and the tab reused the same
 * `SearchOverlay` — correctly, because there is no second search worth
 * maintaining. But the overlay wrapped itself in a React Native `<Modal>`, and
 * a modal renders above the navigator rather than inside it.
 *
 * So a tap on a row did everything it was supposed to. `router.push` ran, the
 * route changed, the incident screen mounted and fetched — underneath a modal
 * that was still covering the whole display. No error, no warning, no log line,
 * and nothing moved on screen. The only symptom available to anybody was "when
 * I click on a report it is not opening up".
 *
 * The dismissal was the second half of it. In a modal the overlay must come
 * down before the push or it hides what it opened, so the row handler called
 * `onClose()` first. On the tab `onClose` is `router.replace('/(tabs)')` — so
 * the handler replaced the current route one statement before pushing onto it,
 * and the two navigations fought. Either fault alone would have been enough.
 *
 * Both are source-read here rather than driven through a renderer. What went
 * wrong was structural — which component wraps which, and what a handler calls
 * before what — and that is visible in the file; standing up a navigator, a
 * query client and a modal host to watch nothing happen would test the harness
 * more than the fix.
 */

const FEED = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(FEED, rel), 'utf8');

const OVERLAY = read('SearchOverlay.tsx');
const SCREEN = read('SearchScreen.tsx');
const BAR = read('FeedBar.tsx');

/** Prose naming the old markup must not read as the old markup. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the files under review were read', () => {
  // A rename empties these and every assertion below passes on an empty string.
  expect(OVERLAY.length).toBeGreaterThan(2000);
  expect(SCREEN.length).toBeGreaterThan(500);
});

describe('the modal is a wrapper, not the screen', () => {
  test('the tab asks for the unwrapped form', () => {
    expect(code(SCREEN)).toMatch(/presentation="screen"/);
  });

  test('and the overlay honours that rather than always presenting a modal', () => {
    /*
     * The regression is a `<Modal>` back at the top of the return, covering
     * both presentations. It must stay behind the check.
     */
    expect(code(OVERLAY)).toMatch(/presentation === 'modal' \? \(\s*<Modal/);
    expect(code(OVERLAY)).toMatch(/const body = \(/);
  });

  test('the masthead still gets a real modal', () => {
    // The fix must not turn the feed's overlay into a bare view drawn under
    // the feed it is supposed to cover.
    expect(code(OVERLAY)).toMatch(/presentation = 'modal'/);
  });
});

describe('opening a result', () => {
  test('one handler decides, and the rows do not each decide for themselves', () => {
    /*
     * Both result lists — the browse rows shown before anybody types and the
     * matches shown after — had their own inline copy of the close-then-open
     * pair. Two copies of a rule is how one of them gets fixed.
     */
    expect((code(OVERLAY).match(/onOpen=\{openIncident\}/g) ?? []).length).toBe(2);
    expect(code(OVERLAY)).not.toMatch(/onOpen=\{\(chosen\) =>/);
  });

  test('the overlay is dismissed only when there is something to dismiss', () => {
    /*
     * The exact shape matters. `onClose()` unconditionally is the bug: on the
     * tab it is `router.replace('/(tabs)')`, which throws away the route the
     * very next line pushes onto.
     */
    expect(code(OVERLAY)).toMatch(/if \(presentation === 'modal'\) onClose\(\);/);
    expect(code(OVERLAY)).toMatch(/onOpenIncident\(chosen\);/);
  });

  test('closing the tab goes home rather than popping nothing', () => {
    // `router.back()` on the first screen of a tab is a silent no-op, which is
    // the same class of dead control this file exists for.
    expect(code(SCREEN)).toMatch(/router\.replace\('\/\(tabs\)'\)/);
  });
});

test('the home masthead no longer carries a second way into the same search', () => {
  /*
   * Search is a tab now. A magnifier in the masthead opening the identical
   * unscoped search, three centimetres above the tab that does it, is a
   * duplicate the reader has to choose between.
   *
   * Scoped search survives, and deliberately: on an organisation's homepage
   * the magnifier searches *that organisation's* reports, which the tab
   * expressly does not do. Losing it there would remove the only way to search
   * within an institution, so this asserts the condition rather than the
   * absence of the button.
   */
  expect(code(BAR)).toMatch(/\{organisation \? \(\s*<Pressable\s*onPress=\{onOpenSearch\}/);
});
