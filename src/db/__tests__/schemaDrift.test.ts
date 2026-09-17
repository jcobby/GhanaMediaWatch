import fs from 'fs';
import path from 'path';

/**
 * The table the app creates must match the table the app writes to.
 *
 * `schema.ts` (what Drizzle builds queries from) and the `CREATE TABLE` in
 * `client.ts` (what actually exists on the device) are two hand-maintained
 * lists of the same thing. Nothing connects them, and nothing compared them.
 *
 * Three columns had already drifted apart — `severity`, `landmark` and
 * `consent_json` were declared and written but never created — which means
 * every submission failed with "no such column" the moment it ran against a
 * real database. It is invisible in development because the tests never touch
 * SQLite, and invisible in review because the two lists are 300 lines apart.
 *
 * This is a text comparison rather than a live migration check on purpose: it
 * runs in milliseconds, needs no native module, and catches the mistake at the
 * only moment it is cheap to fix.
 */

const ROOT = path.resolve(__dirname, '../../..');
const schemaSrc = fs.readFileSync(path.join(ROOT, 'src/db/schema.ts'), 'utf8');
const clientSrc = fs.readFileSync(path.join(ROOT, 'src/db/client.ts'), 'utf8');

/** Column names Drizzle will put in a query. */
const declared = [...schemaSrc.matchAll(/\b(?:text|integer|real)\('([a-z_0-9]+)'/g)].map(
  (m) => m[1]!,
);

/** Column names the CREATE TABLE actually brings into existence. */
const ddl = clientSrc.slice(clientSrc.indexOf('CREATE TABLE'), clientSrc.indexOf('CREATE INDEX'));
const created = [...ddl.matchAll(/^\s*([a-z_0-9]+)\s+(?:TEXT|INTEGER|REAL)/gm)].map((m) => m[1]!);

/** Columns added to an existing table by the upgrade step. */
const upgraded = [...clientSrc.matchAll(/\['([a-z_0-9]+)', *['"]/g)].map((m) => m[1]!);

test('the scan finds a real schema', () => {
  // Guards the three checks below from passing because a regex stopped matching.
  expect(declared.length).toBeGreaterThan(30);
  expect(created.length).toBeGreaterThan(30);
});

test('every column the app writes exists in the table it creates', () => {
  const missing = declared.filter((c) => !created.includes(c));
  expect(missing).toEqual([]);
});

test('the table creates no column the app does not know about', () => {
  // The other direction. A stale column is harmless at runtime but means the
  // two lists have diverged, which is how the first failure started.
  const extra = created.filter((c) => !declared.includes(c));
  expect(extra).toEqual([]);
});

test('every column added after the first release has an upgrade path', () => {
  /*
   * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists,
   * so a new column reaches a fresh install and no one else. Devices that ran
   * the previous build need an explicit `ALTER TABLE`, and the failure without
   * one lands on the reporter's phone after they have filmed something.
   *
   * Checked by name so that adding a column to both lists and forgetting the
   * upgrade still fails here.
   */
  const afterFirstRelease = [
    'severity',
    'landmark',
    'consent_json',
    'destination',
    'directed_business_ids',
    'poster_at_ms',
    'show_address',
    'address',
    'plus_code',
  ];
  const unupgradable = afterFirstRelease.filter((c) => !upgraded.includes(c));
  expect(unupgradable).toEqual([]);
});

test('the upgrade step gives every non-null column a default', () => {
  /*
   * `ALTER TABLE ADD COLUMN x TEXT NOT NULL` is rejected by SQLite when rows
   * already exist — there is nothing to put in the new cells. Silent in
   * development, where the table is usually empty; fatal on a device with a
   * queue.
   */
  const notNullWithoutDefault = [...clientSrc.matchAll(/\['[a-z_0-9]+', *'([^']*)'\]/g)]
    .map((m) => m[1]!)
    .filter((def) => /NOT NULL/.test(def) && !/DEFAULT/.test(def));

  expect(notNullWithoutDefault).toEqual([]);
});
