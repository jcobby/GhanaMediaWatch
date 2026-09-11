import fs from 'fs';
import path from 'path';

/**
 * A sheet you can always get out of.
 *
 * Reported from the reporter's own report sheet: "I can't go back from here."
 * The panel had no height limit and grew with its content, so a report with a
 * video in it — a 3:4 stage plus the description, the metadata block and the
 * outcome timeline — came to more than a phone screen. The overflow went
 * *upwards*, because the sheet is anchored to the bottom: the grab handle, the
 * title and the close button slid off above the status bar, while the backdrop
 * that would have dismissed it was squeezed to nothing in the same movement.
 *
 * On iOS, with no hardware back button, that is a screen with no exit at all.
 * `onRequestClose` saved Android and nothing saved iOS.
 *
 * Bounded at the component, not at the one sheet that got tall enough to show
 * it — the next sheet to grow would fail exactly the same way.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('a sheet can never grow past the top of the screen', () => {
  const sheet = code('components/ui/Sheet.tsx');
  expect(sheet).toMatch(/useWindowDimensions/);
  expect(sheet).toMatch(/maxHeight: screenH - insets\.top - 12/);
});

test('the cap clips the sheet rather than letting it paint outside', () => {
  /*
   * A React Native View is `overflow: visible` by default, so a maxHeight alone
   * bounds the layout and lets the content draw straight through the edge —
   * which looks exactly like the bug it is meant to fix.
   */
  expect(code('components/ui/Sheet.tsx')).toMatch(/overflow-hidden rounded-t-xl/);
});

test('the body gives way before the title and the close button do', () => {
  /*
   * Header and body laid out as equals against the cap means the header loses
   * some of its height too — which is the close button gone again, by a smaller
   * margin. The body shrinks; the way out does not.
   */
  expect(code('components/ui/Sheet.tsx')).toMatch(/className="shrink">\{children\}/);
});

test('the way out is always drawn, not only when the sheet is short', () => {
  // Both routes: the close button in the header, and the backdrop behind it.
  const sheet = code('components/ui/Sheet.tsx');
  expect(sheet).toMatch(/accessibilityLabel="Close"[\s\S]{0,200}name="close"/);
  expect(sheet).toMatch(/onPress=\{onClose\}[\s\S]{0,120}className="flex-1 bg-black\/60"/);
  expect(sheet).toMatch(/onRequestClose=\{onClose\}/);
});

test('the report stage does not claim more than half the sheet', () => {
  /*
   * 3:4 of the full width is taller than the panel it sits in, so the state
   * badge, a rejection reason and the outcome timeline — everything the sheet
   * exists to show — all began below the fold. `contain` means a cap costs
   * scale and nothing else.
   */
  expect(code('features/profile/ReportSheetBody.tsx')).toMatch(/maxHeight: screenH \* 0\.5/);
});
