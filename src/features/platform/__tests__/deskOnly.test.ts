import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * One authority per consequential act.
 *
 * The platform tier was built twice — here and in the web console — with the
 * same five surfaces and nothing saying which was in charge. Both could approve
 * an institution; both could release a payout batch. That is not redundancy. It
 * is two answers to "has this been done", and for money there is only ever one
 * right answer.
 *
 * The split is by consequence, not convenience:
 *
 *   - **Reversible and time-critical** — routing a report to the right body —
 *     belongs wherever the operator is, including a phone in a car.
 *   - **Irreversible and evidentiary** — granting an organisation access to
 *     citizens' footage, moving money — belongs where the evidence can be read.
 *
 * These tests pin the second half. The first half is deliberately untouched.
 */

const PLATFORM = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(PLATFORM, file), 'utf8');

/** Screens whose decision lives in the console, and what they must not do. */
const DESK_ONLY: { file: string; forbidden: RegExp; what: string }[] = [
  {
    file: 'OrganisationApprovalScreen.tsx',
    /*
     * Granting access to the public's footage after reading a screening result.
     *
     * Matches *assignment*, not the literal. Reading `status === 'approved'` to
     * render a badge is exactly what a read-only queue should do; an earlier
     * version of this pattern banned the word outright and failed on the badge,
     * which would have pushed the fix toward hiding the status rather than the
     * decision.
     */
    forbidden: /status:\s*'(approved|rejected)'|setApplications/,
    what: 'approve or reject an institution',
  },
  {
    file: 'PayoutsScreen.tsx',
    // Moving money. There is no undo.
    forbidden: /status:\s*'settled'|setBatches/,
    what: 'release a payout batch',
  },
];

test('the files being checked still exist', () => {
  // Renaming a screen must not silently retire its guard.
  for (const { file } of DESK_ONLY) {
    expect([file, fs.existsSync(path.join(PLATFORM, file))]).toEqual([file, true]);
  }
});

for (const { file, forbidden, what } of DESK_ONLY) {
  test(`the phone cannot ${what}`, () => {
    const src = read(file);
    // Comments describe the rule and legitimately name the states; the check is
    // about code, so they are stripped first.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(forbidden);
  });

  test(`${file} says where the decision is taken`, () => {
    /*
     * Shown, not hidden. An operator who opens the queue on a phone and finds
     * no buttons concludes the app is broken; told plainly, they know the work
     * is real and where it happens.
     */
    // The rendered element, not the import. Matching the bare name passes on
    // an unused import, so deleting the notice while keeping the line at the
    // top of the file would have gone unnoticed.
    expect(read(file)).toMatch(/<DeskOnly\s/);
  });
}

test('routing stays available on the phone', () => {
  /*
   * The other side of the split, asserted so it is not "tidied" away by
   * somebody applying the rule too broadly. Routing is reversible and often
   * urgent — an operator away from a desk should still be able to send a
   * report to the right body.
   */
  const routing = read('RoutingDeskScreen.tsx');
  expect(routing).not.toMatch(/<DeskOnly\s/);
  expect(routing).toMatch(/setItems/);
});

test('both explanations are written and specific', () => {
  const copy = (en as { deskOnly: { approval: string; payout: string } }).deskOnly;
  expect(copy.approval).toBeTruthy();
  expect(copy.payout).toBeTruthy();

  // Each must say *why* this one is desk work, not merely that it is. A
  // generic "not available on mobile" teaches an operator nothing and reads
  // as a missing feature.
  expect(copy.approval.length).toBeGreaterThan(60);
  expect(copy.payout.length).toBeGreaterThan(60);
  expect(copy.approval).not.toEqual(copy.payout);
});
