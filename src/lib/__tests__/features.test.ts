import fs from 'fs';
import path from 'path';
import { ORGANISATION_TIER_ENABLED } from '../features';

/**
 * The institution tier stays off the phone while the flag says so.
 *
 * Hidden with a flag rather than deleted: the screens are built and tested, and
 * this is a product decision that may be reversed. Deleting them would make
 * reversing it a rewrite.
 *
 * What makes a flag fragile is the next entry point — somebody adds a link to
 * `/organisation` from a new screen, does not know the flag exists, and the tier is
 * half-visible again. Nothing fails; it just reappears. So this checks the
 * routes rather than trusting the flag.
 *
 * The public directory is deliberately not covered. `/organisations` is a reader
 * looking up an organisation, which has nothing to do with holding an account.
 */

const SRC = path.resolve(__dirname, '../..');

/** Every source file outside the organisation tier and its tests. */
function filesOutsideTheTier(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const rel = path.relative(SRC, full).replace(/\\/g, '/');
        // The tier's own screens may link within themselves.
        if (rel.startsWith('features/organisation/') || rel.startsWith('app/organisation/'))
          continue;
        out.push(full);
      }
    }
  })(SRC);
  return out;
}

test('the scan finds the app', () => {
  expect(filesOutsideTheTier().length).toBeGreaterThan(50);
});

test('the tier is currently off', () => {
  // If this is ever flipped on deliberately, the test below stops applying and
  // should be revisited rather than deleted.
  expect(ORGANISATION_TIER_ENABLED).toBe(false);
});

test('nothing routes into the tier without checking the flag', () => {
  /*
   * `/organisation` — singular — is the account tier. A link to it from an ungated
   * line is a door into a shell the product has decided not to offer, and on a
   * phone it is a dead end with no way back.
   */
  const offenders: string[] = [];

  for (const file of filesOutsideTheTier()) {
    const src = fs.readFileSync(file, 'utf8');

    /*
     * Counted, not located.
     *
     * "Does this file mention the flag" passes the moment one link is gated, so
     * a second ungated link on the same screen slips through. Looking for the
     * flag *near* each link fails the same way, because the window reaches back
     * into the previous, properly gated block.
     *
     * Counting is blunt and it holds: every link into the tier needs its own
     * gate, so a new link without a new gate leaves the file one short.
     */
    const links = [...src.matchAll(/['"`]\/organisation(?:\/|['"`])/g)];
    if (links.length === 0) continue;

    const gates = [...src.matchAll(/ORGANISATION_TIER_ENABLED\s*&&/g)].length;
    if (gates >= links.length) continue;

    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    offenders.push(`${rel} — ${links.length} link(s), ${gates} gate(s)`);
  }

  expect(offenders).toEqual([]);
});

test('the public directory is untouched', () => {
  /*
   * The opposite failure: gating `/organisations` along with `/organisation` would
   * remove a reader feature by accident, and the two differ by one character.
   */
  const feed = fs.readFileSync(path.join(SRC, 'features/feed/FeedScreen.tsx'), 'utf8');
  expect(feed).toMatch(/\/organisations/);
  expect(feed).not.toMatch(/ORGANISATION_TIER_ENABLED/);
});
