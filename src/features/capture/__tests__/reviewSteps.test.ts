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

describe('the steps of filing', () => {
  test('in the order asked for', () => {
    expect(review()).toMatch(
      /const BASE_STEPS = \['stepCapture', 'stepDetails', 'stepSend'\] as const;/,
    );
    expect(copy.stepCapture).toBe('Capture & category');
    expect(copy.stepDetails).toBe('Details & urgency');
    expect(copy.stepSend).toBe('Where to send it');
  });

  test('step 1 holds the capture and the category', () => {
    const src = review();
    const one = src.slice(src.indexOf('{current === 0 ? ('), src.indexOf('{current === 1 ? ('));
    expect(one).toMatch(/<CapturePreview/);
    expect(one).toMatch(/INCIDENT_CATEGORIES\.map/);
  });

  test('step 2 holds the description, and urgency and anonymity in one card', () => {
    const src = review();
    const two = src.slice(src.indexOf('{current === 1 ? ('), src.indexOf('{current === 2 ? ('));
    expect(two).toMatch(/accessibilityLabel=\{t\('review\.description'\)\}/);
    const card = two.slice(two.indexOf('<Glass elevation="low" className="gap-3'), two.indexOf('</Glass>', two.indexOf('<SeverityField')));
    expect(card).toMatch(/<SeverityField/);
    expect(card).toMatch(/label=\{t\('review\.anonymous'\)\}/);
  });

  test('step 3 holds where it goes and what the public sees', () => {
    const src = review();
    const three = src.slice(src.indexOf('{current === 2 ? ('), src.indexOf('{current === 3 ? ('));
    expect(three).toMatch(/<DestinationPicker/);
    expect(three).toMatch(/label=\{t\('review\.showLocation'\)\}/);
    expect(three).toMatch(/label=\{t\('review\.showAddress'\)\}/);
  });

  test('the description gates Next on step 2 and Submit at the end', () => {
    const src = review();
    expect(src).toMatch(/disabled=\{current === 1 && blocker !== null\}/);
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
    expect(review()).toMatch(/if \(key === 'whistleblower'\) setAnonymous\(true\)/);
  });
});

describe('the place in words', () => {
  test('the preview no longer names a made-up place', () => {
    expect(review()).not.toMatch(/Kaneshie, Accra/);
    expect(review()).toMatch(/useCaptureAddress\(pending\?\.fix\.latitude, pending\?\.fix\.longitude\)/);
  });

  test('show location is the street and plus code; show address needs the location on', () => {
    const src = review();
    expect(src).toMatch(/\[place\.street \?\? place\.locality, plusCode\]/);
    const address = src.slice(src.indexOf("label={t('review.showAddress')}"));
    expect(address.slice(0, 500)).toMatch(/disabled=\{!showLocation\}/);
  });

  test('both are saved with the queued report', () => {
    expect(review()).toMatch(/place: \{ address: place\.address, plusCode: place\.plusCode\?\.full \?\? null \}/);
    const store = code('../../stores/captureStore.ts');
    expect(store).toMatch(/showAddress: showLocation \? state\.showAddress : false/);
  });
});
