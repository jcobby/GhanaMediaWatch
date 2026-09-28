import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { COUNTRIES, HOME_COUNTRY, countryByCode } from '@/types/countries';

/**
 * A country control on a platform that holds one country's reports.
 *
 * **Nothing here may imply a filter that does not exist.** There is no
 * `country` on `PublicIncident`, no `country` parameter on `GET /incidents`,
 * and the app's own types say "null means anywhere in the country" — singular.
 * So the picker offers Ghana, lists the rest as not yet covered, and says why.
 * A control that offered six countries and returned the same feed for every one
 * of them is the failure this file exists to prevent, and it is the failure
 * that is easiest to introduce later by flipping a flag to make the sheet look
 * busier.
 *
 * When the service grows the field and the filter — item **W** in the console
 * repo's `BACKEND-REQUESTS.md` — `covered` becomes true on an entry and neither
 * the sheet nor the masthead changes.
 */

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const BAR = read('features/feed/FeedBar.tsx');
const PICKER = read('features/feed/CountryPicker.tsx');
const FLAG = read('components/Flag.tsx');

/**
 * Comments removed, because these rules are about code.
 *
 * The emoji rule below matched `Flag.tsx`'s own doc comment, which quotes the
 * flag emoji as the example of what not to do — the assertion failed on the
 * sentence written to explain it.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the files under review were read', () => {
  expect(BAR.length).toBeGreaterThan(2000);
  expect(PICKER.length).toBeGreaterThan(1000);
});

describe('what the platform actually holds', () => {
  test('exactly one country is covered, and it is Ghana', () => {
    /*
     * The assertion that has to fail loudly if somebody makes the sheet look
     * fuller. A second `covered: true` is a claim that the feed can be filtered
     * to it, and today nothing can.
     */
    const covered = COUNTRIES.filter((c) => c.covered);
    expect(covered.map((c) => c.code)).toEqual(['GH']);
    expect(HOME_COUNTRY.code).toBe('GH');
  });

  test('the sheet states the limit rather than implying a choice', () => {
    expect(en.feed.countrySubtitle).toMatch(/Ghana/);
    expect(en.feed.countryNotYet).toBe('Not yet covered');
    /*
     * "Not yet covered" is a fact. "Coming soon" is a date, and nobody on this
     * side can keep it — so the copy must not drift into one.
     */
    const copy = JSON.stringify(en.feed);
    expect(copy).not.toMatch(/coming soon/i);
    expect(en.feed.countryNotYetHelp).toMatch(/no reports|nothing to show/i);
  });

  test('an uncovered country is not offered as a tappable choice', () => {
    /*
     * A row without `onPress` rather than a disabled button: a control that
     * looks tappable and refuses is a worse answer than one that never invited
     * the tap.
     */
    expect(PICKER).toMatch(/if \(!onPress\) \{/);
    expect(PICKER).toMatch(/rest\.map\(\(country\) => \(\s*<CountryRow key=\{country\.code\} country=\{country\} selected=\{false\} \/>/);
  });
});

describe('the flags', () => {
  test('are drawn, not emoji', () => {
    /*
     * `🇬🇭` is the obvious answer and it fails on the devices this app is for:
     * Android renders regional-indicator pairs as the bare letters "GH" on a
     * great many handsets, with no way to detect it at runtime. The masthead
     * would show a flag on a reviewer's iPhone and two grey capitals on a
     * reader's phone in Accra.
     */
    expect(stripComments(FLAG)).not.toMatch(/\p{Regional_Indicator}/u);
    expect(stripComments(BAR)).not.toMatch(/\p{Regional_Indicator}/u);
    expect(stripComments(read('types/countries.ts'))).not.toMatch(/\p{Regional_Indicator}/u);
    expect(FLAG).toMatch(/backgroundColor: colour/);
  });

  test('every country has one, and it is a plain band design', () => {
    for (const country of COUNTRIES) {
      expect([country.code, country.flag.bands.length >= 2]).toEqual([country.code, true]);
      expect([country.code, country.flag.direction]).toEqual([
        country.code,
        expect.stringMatching(/^(horizontal|vertical)$/),
      ]);
      // Every band is a real colour, or the flag renders as gaps.
      for (const band of country.flag.bands) {
        expect([country.code, /^#[0-9A-F]{6}$/i.test(band)]).toEqual([country.code, true]);
      }
    }
  });

  test('no flag needing heraldry is listed', () => {
    /*
     * Kenya's shield, Eswatini's, Angola's machete — none can be drawn as
     * bands, and an approximation of a national flag is worse than its absence,
     * considerably so in a product about verifying what is true. If one of
     * these appears, it arrived as a guess.
     */
    const heraldic = ['KE', 'SZ', 'AO', 'MZ', 'ZW'];
    expect(COUNTRIES.filter((c) => heraldic.includes(c.code))).toEqual([]);
  });

  test('codes are ISO 3166-1 alpha-2 and unique', () => {
    // Whatever `country` filter arrives will almost certainly take these.
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect([code, /^[A-Z]{2}$/.test(code)]).toEqual([code, true]);
    expect(countryByCode('GH')?.name).toBe('Ghana');
  });
});

describe('where it sits', () => {
  test('immediately left of the search button', () => {
    const flagAt = BAR.indexOf('setCountryOpen(true)');
    const searchAt = BAR.indexOf('onPress={onOpenSearch}');
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(searchAt);
  });

  test('not on an organisation’s homepage', () => {
    /*
     * That page is one organisation's reports wherever they are from, and a
     * country scope over the top of it would be a second filter arguing with
     * the first.
     */
    expect(BAR).toMatch(/\{!organisation \? \(\s*<Pressable\s*onPress=\{\(\) => setCountryOpen\(true\)\}/);
  });
});
