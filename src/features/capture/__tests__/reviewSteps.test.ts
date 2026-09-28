import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { INCIDENT_CATEGORIES } from '@/types/api';
import { categoryIcon } from '@/lib/categoryIcon';
import { categoryColor } from '@/lib/theme';

/**
 * Filing in three steps, a whistleblower category, and the place in words.
 */

const code = (rel: string) =>
  fs
    .readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const review = () => code('ReviewScreen.tsx');
const copy = en.review as unknown as Record<string, string>;

/*
 * **These assertions were a step behind the screen and had been for a while.**
 * The capture step now holds the description and the details step the category
 * — they were the other way round — so five of them failed on the *order*
 * while the behaviours they were written to protect were all intact. A suite
 * that fails for a reason nobody acts on stops being read, and this one was
 * hiding a real bug among the noise: `showAddress` below.
 */
describe('the steps of filing', () => {
  test('in the order asked for', () => {
    expect(review()).toMatch(
      /const BASE_STEPS = \['stepCapture', 'stepDetails', 'stepSend'\] as const;/,
    );
    // The description comes before the category: somebody has just filmed
    // something and the words are what they have in mind, not a taxonomy.
    expect(copy.stepCapture).toBe('Capture & description');
    expect(copy.stepDetails).toBe('Category & urgency');
    expect(copy.stepSend).toBe('Where to send it');
  });

  test('step 1 holds the capture and the description', () => {
    const src = review();
    const one = src.slice(src.indexOf('{current === 0 ? ('), src.indexOf('{current === 1 ? ('));
    expect(one).toMatch(/<CapturePreview/);
    expect(one).toMatch(/accessibilityLabel=\{t\('review\.description'\)\}/);
  });

  test('step 2 holds the category, and urgency and anonymity in one card', () => {
    const src = review();
    const two = src.slice(src.indexOf('{current === 1 ? ('), src.indexOf('{current === 2 ? ('));
    expect(two).toMatch(/<SeverityField/);
    expect(two).toMatch(/label=\{t\('review\.anonymous'\)\}/);
    // Whistleblower is its own card above the grid, and choosing it starts the
    // report anonymous — see the whistleblower block below.
    expect(two).toMatch(/t\('review\.whistleblowerNote'\)/);
  });

  test('step 3 is where it goes', () => {
    const src = review();
    const three = src.slice(src.indexOf('{current === 2 ? ('), src.indexOf('{current === 3 ? ('));
    expect(three).toMatch(/<DestinationPicker/);
  });

  test('the description gates Next on the step that asks for it, and Submit at the end', () => {
    const src = review();
    // Step 0 now, because the description moved there with the capture.
    expect(src).toMatch(/disabled=\{current === 0 && blocker !== null\}/);
    expect(src).toMatch(/disabled=\{sendBlocker !== null\}/);
  });
});

describe('choosing who receives it is a step, not a popup', () => {
  /*
   * Asked for after the sheet was tried: "if you user selects send to specific
   * organizations, do a next step for searching or choosing the organization".
   *
   * A half-height sheet with its own search box and its own Done button, sitting
   * on top of the form, is a second screen pretending to be a control. Naming
   * four newsrooms is a real task and gets a real step.
   */
  test('the fourth step exists only when the report is directed', () => {
    const src = review();
    expect(src).toMatch(/directed \? \[\.\.\.BASE_STEPS, 'stepRecipients'\] : BASE_STEPS/);
    expect(src).toMatch(/stepsFor\(destination === 'directed'\)/);
    expect(copy.stepRecipients).toBe('Choose organisations');
  });

  test('the step holds the searchable list itself, not a button that opens one', () => {
    const src = review();
    const four = src.slice(src.indexOf('{current === 3 ? ('));
    expect(four).toMatch(/<OrganisationList/);
    expect(four).toMatch(/mode="multi"/);
    expect(four).toMatch(/selectedIds=\{businessIds\}/);
    // The sheet it replaced is gone from the screen entirely.
    expect(src).not.toMatch(/OrganisationPickerSheet/);
  });

  test('the money is quoted on the step that decides it, not a step earlier', () => {
    /*
     * The coupling that broke silently, now pinned.
     *
     * While recipients were picked inline on the destination step, the earnings
     * card updated as each one was ticked. Moving them to a step of their own
     * left the card behind on step three — where `selectedOrganisationIds` is
     * still empty, so `licensedBy` was 1 and `bestOffer` had nothing to search.
     * A reporter chose "send to specific organisations", read a figure, named
     * four newsrooms, and sent: the real commission was higher every time, and
     * they never saw it.
     *
     * Nothing failed. No type error, no red test — the estimate was correct for
     * the inputs it had, and the inputs had not been chosen yet. That is exactly
     * the class of bug a source-level assertion is for: the two must render
     * together, and if anybody separates them again this is what says so.
     */
    const src = review();

    const four = src.slice(src.indexOf('{current === 3 ? ('));
    expect(four).toMatch(/<OrganisationList/);
    expect(four).toMatch(/<EarningsEstimate/);
    // It must read the same selection the list above it writes.
    expect(four).toMatch(/selectedOrganisationIds=\{businessIds\}/);

    // And it must not still be sitting on the step before.
    const three = src.slice(src.indexOf('{current === 2 ? ('), src.indexOf('{current === 3 ? ('));
    expect(three).not.toMatch(/<EarningsEstimate/);

    /*
     * The picker keeps the figure for every other destination, where there are
     * no recipients to wait for and one licensee is the truth. Dropping it
     * there would have fixed the directed case by making the other three
     * quieter than they should be.
     */
    const picker = code('DestinationPicker.tsx');
    expect(picker).toMatch(/destination !== 'directed' \? \(/);
    expect(picker).toMatch(/<EarningsEstimate/);
  });

  test('only organisations that can actually receive a report are offered', () => {
    // The same live directory the destination step quotes its rates from.
    expect(review()).toMatch(/const available = useMemo\(\(\) => receiving\(directory\), \[directory\]\);/);
  });

  test('a directed report cannot be sent to nobody', () => {
    /*
     * "Send to specific organisations" with none chosen routes the report
     * nowhere. Said at the review screen, not discovered in the outbox.
     */
    const src = review();
    expect(src).toMatch(/destination === 'directed' && businessIds\.length === 0/);
    expect(src).toMatch(/const sendBlocker = blocker \?\? recipientsBlocker;/);
    expect(copy.needRecipients).toMatch(/organisation/i);
  });

  test('losing the fourth step does not strand a reporter standing on it', () => {
    // Changing the destination back from "specific organisations" shortens the
    // wizard underneath them, so the index is clamped rather than trusted.
    expect(review()).toMatch(/const current = Math\.min\(step, steps\.length - 1\);/);
  });
});

describe('sending without an account is called anonymous', () => {
  test('the words', () => {
    expect(copy.guestSheetSend).toBe('Send as anonymous');
    expect(copy.guestSheetTitle).toBe('Sending anonymously');
    expect(`${copy.guestSheetSend} ${copy.guestSheetTitle}`).not.toMatch(/guest/i);
  });
});

describe('whistleblower', () => {
  test('is a category with a colour, an icon and a name', () => {
    expect(INCIDENT_CATEGORIES).toContain('whistleblower');
    expect(categoryColor.whistleblower).toBeTruthy();
    expect(categoryIcon.whistleblower).toBe('megaphone');
    expect((en.category as Record<string, string>).whistleblower).toBe('Whistleblower');
  });

  test('choosing it starts the report anonymous', () => {
    /*
     * A whistleblower is usually identifiable by what they know, so this is the
     * one category that changes the starting point. It stays their choice — the
     * anonymity switch is on the same step.
     *
     * Matched on the pair rather than on one line: the card moved out of the
     * category grid into its own block above it, so the old
     * `if (key === 'whistleblower')` shape is gone while the behaviour is not.
     */
    const src = review();
    const card = src.slice(src.indexOf("setCategory('whistleblower')"));
    expect(card.slice(0, 400)).toMatch(/setAnonymous\(true\)/);
  });
});

describe('the place in words', () => {
  test('the preview no longer names a made-up place', () => {
    expect(review()).not.toMatch(/Kaneshie, Accra/);
    expect(review()).toMatch(/useCaptureAddress\(pending\?\.fix\.latitude, pending\?\.fix\.longitude\)/);
  });

  test('the public line is the street and the plus code', () => {
    expect(review()).toMatch(/\[place\.street \?\? place\.locality, plusCode\]/);
  });

  test('the street address is never published on a choice nobody was offered', () => {
    /*
     * **This is the assertion that was hiding a real bug.** The old version
     * looked for a `review.showAddress` switch and a `disabled={!showLocation}`
     * on it — a control that was removed when the steps were restructured,
     * leaving the flag behind with nothing to set it.
     *
     * What was left: the store defaulted `showAddress` to `true`, the wire
     * declares `DisplayFlags.showAddress` as `default: false`, and every report
     * submitted `true`. The app was asking the platform to publish the
     * reporter's street address on the strength of a choice nobody was ever
     * shown, on a product whose premise is that people at risk can file safely.
     *
     * Two rules now, and they are independent on purpose: the default must be
     * the quiet one, and the payload must never contradict `showLocation`
     * whatever the default becomes. Give it a real switch and only the first
     * of these changes.
     */
    expect(code('../../stores/captureStore.ts')).toMatch(/showAddress: false,/);
    expect(review()).toMatch(/showAddress: showLocation && showAddress,/);
  });

  test('both are saved with the queued report', () => {
    // The address and the plus code travel with the queued report either way;
    // what the flags decide is whether either is ever shown publicly.
    expect(review()).toMatch(/place: \{ address: place\.address, plusCode: place\.plusCode\?\.full \?\? null \}/);
    expect(code('../../stores/captureStore.ts')).toMatch(/showAddress: boolean;/);
  });
});
