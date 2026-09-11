import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * One word for one thing, and a line the rename must not cross.
 *
 * The app called the same party an "organisation" in 51 strings and a
 * "business" in 12, and they met on one screen. On the destination picker a
 * reporter was asked to "Offer to businesses", then to "Choose organisations",
 * and told "No organisation has joined the platform" if none had — three names
 * for the party they were deciding whether to send their footage to.
 *
 * It is one entity: a newsroom, a district assembly, NADMO, an insurer. It is
 * called an organisation everywhere now, which is also the more accurate word —
 * an assembly is not a business.
 *
 * **What stayed is the interesting half.** A vocabulary sweep is exactly the
 * change that reads correctly and breaks something, so three things are frozen:
 *
 *   1. **Property names on the wire and in SQLite.** `requestedBusinessIds`,
 *      `directedBusinessIds`, `businessId`, `businessName`. Renaming a field
 *      the server validates is renaming the contract, and this one has form —
 *      the app once sent `directedBusinessIds` where the server read
 *      `requestedBusinessIds`, and reports a reporter had deliberately
 *      addressed to two agencies arrived addressed to nobody.
 *   2. **`business` as a NewsSection.** A different word: the desk a story runs
 *      on, beside Ghana, Africa and Sport.
 *   3. **`business` as an Ionicons glyph.** The icon set's vocabulary, not ours.
 */

const SRC = path.resolve(__dirname, '..');

function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('the word a reporter reads', () => {
  test('no string in the interface says business', () => {
    /*
     * `section.business` is the news desk and is the one exception — "Business
     * News" is a heading in a feed, not the party that licenses a report.
     */
    const offenders: string[] = [];

    const walk = (node: unknown, keyPath: string) => {
      if (typeof node === 'string') {
        if (keyPath === 'section.business') return;
        if (/business/i.test(node)) offenders.push(`${keyPath} = ${node}`);
        return;
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          walk(value, keyPath ? `${keyPath}.${key}` : key);
        }
      }
    };

    walk(en, '');
    expect(offenders).toEqual([]);
  });

  test('no translation key says business either', () => {
    // The keys are read by developers and appear in every call site; leaving
    // `t('business.plan')` beside copy that says organisation is the same
    // split, one layer down.
    const keys: string[] = [];
    const walk = (node: unknown, keyPath: string) => {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        for (const [key, value] of Object.entries(node)) {
          const here = keyPath ? `${keyPath}.${key}` : key;
          if (/business/i.test(key) && here !== 'section.business') keys.push(here);
          walk(value, here);
        }
      }
    };
    walk(en, '');
    expect(keys).toEqual([]);
  });

  test('nothing in the code still calls it a business', () => {
    const offenders: string[] = [];

    for (const file of sources(SRC)) {
      if (file.includes('__tests__')) continue;

      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        // The frozen cases, removed before the search.
        .replace(/\b(requestedBusinessIds|suggestedBusinessIds|directedBusinessIds)\b/g, ' ')
        .replace(/\b(businessId|businessIds|businessName)\b/g, ' ')
        .replace(/'business(-outline)?'/g, ' ')
        .replace(/"business(-outline)?"/g, ' ')
        .replace(/'directed_business_ids'/g, ' ')
        // `/org/dashboard` wraps the organisation under its own key.
        .replace(/business\?: \{ id\?: string; name\?: string \}/g, ' ')
        .replace(/dashboard\.business/g, ' ');

      if (/\bbusiness(es)?\b/i.test(code)) offenders.push(path.relative(SRC, file));
    }

    expect(offenders).toEqual([]);
  });
});

describe('the line the rename must not cross', () => {
  test('the submission field names are the ones the server reads', () => {
    const request = read(path.join(SRC, 'services', 'createRequest.ts'));
    expect(request).toMatch(/requestedBusinessIds/);

    const schema = read(path.join(SRC, 'db', 'schema.ts'));
    expect(schema).toMatch(/directedBusinessIds: text\('directed_business_ids'\)/);
  });

  test('the business news desk is not an organisation', () => {
    const sections = read(path.join(SRC, 'types', 'sections.ts'));
    expect(sections).toMatch(
      /'ghana' \| 'africa' \| 'world' \| 'business' \| 'politics' \| 'sport'/,
    );
    expect((en as { section: Record<string, string> }).section.business).toBe('Business News');
  });

  test('a profile written before the rename still gets its own app', () => {
    /*
     * `accountType` is kept in the keychain. `'business' === 'organisation'` is
     * merely false, so without this somebody signs in, matches none of the
     * organisation checks, and is shown the reporter's app — their inbox gone,
     * with nothing on screen to explain it.
     */
    const store = read(path.join(SRC, 'stores', 'authStore.ts'));
    expect(store).toMatch(
      /stored === 'business' \? \{ \.\.\.profile, accountType: 'organisation' \}/,
    );
  });
});
