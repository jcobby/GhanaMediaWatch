import fs from 'fs';
import path from 'path';

/**
 * Search is one icon and one screen, and choosing an organisation there turns
 * home into that organisation's homepage.
 *
 * What this replaced: a wide "Search organisations" pill under the masthead that
 * opened a half-height sheet containing a second search box. Two fields for one
 * job, and neither of them the pattern people already know from every other app
 * on the phone.
 */

const SRC = path.resolve(__dirname, '../../..');
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

describe('one standard search', () => {
  const screen = () => code('features/feed/FeedScreen.tsx');
  const bar = () => code('features/feed/FeedBar.tsx');
  const overlay = () => code('features/feed/SearchOverlay.tsx');

  test('the bar carries a search icon, not a search field', () => {
    const src = bar();
    expect(src).toMatch(/onPress=\{onOpenSearch\}/);
    expect(src).toMatch(/name="search"/);
    // The pill and the words that lived on it.
    expect(src).not.toMatch(/searchOrganisations|switchOrganisation|<TextInput/);
  });

  test('the sheet with a search box inside it is gone', () => {
    expect(fs.existsSync(path.join(SRC, 'features/organisations/OrganisationPickerSheet.tsx'))).toBe(
      false,
    );
    expect(screen()).not.toMatch(/OrganisationPickerSheet/);
  });

  test('one field searches both, under two tabs', () => {
    const src = overlay();
    expect(src).toMatch(/\(\['stories', 'organisations'\] as const\)/);
    expect(src).toMatch(/<FeedRow/);
    expect(src).toMatch(/<OrganisationList/);
    // One query drives both tabs, so switching tab keeps what was typed.
    expect(src).toMatch(/query=\{query\}/);
  });

  test('closing the search leaves the feed exactly as it was', () => {
    // The query lives in the overlay, so nothing it typed filters the feed
    // underneath it once it is closed.
    expect(overlay()).toMatch(/const \[query, setQuery\] = useState\(''\);/);
    expect(screen()).not.toMatch(/const \[query, setQuery\]/);
  });

  test('choosing an organisation opens its homepage and closes the search', () => {
    expect(overlay()).toMatch(/onClose\(\);\s*onOpenOrganisation\(id\);/);
    expect(screen()).toMatch(
      /onOpenOrganisation=\{\(id\) => enterOrganisation\(approved\.find\(\(o\) => o\.id === id\) \?\? null\)\}/,
    );
  });
});

describe('an organisation homepage', () => {
  const screen = () => code('features/feed/FeedScreen.tsx');
  const bar = () => code('features/feed/FeedBar.tsx');

  test("the feed switches to the organisation's own reports", () => {
    expect(screen()).toMatch(/useOrganisationFeed\(organisation\?\.id \?\? null\)/);
    expect(screen()).toMatch(/const active = organisation \? organisationFeed : feed;/);
    expect(code('api/http.ts')).toMatch(
      /`\/organisations\/\$\{encodeURIComponent\(organisationId\)\}\/incidents`/,
    );
  });

  test("its logo replaces GNA's, with a back arrow to the GNA homepage", () => {
    const src = bar();
    const orgBranch = src.slice(src.indexOf('{organisation ? ('), src.indexOf(') : ('));
    expect(orgBranch).toMatch(
      /<OrganisationAvatar name=\{organisation\.name\} logoUrl=\{organisation\.logoUrl\}/,
    );
    expect(orgBranch).toMatch(/onPress=\{onExitOrganisation\}/);
    expect(orgBranch).not.toMatch(/GnaHomeLogo/);
    expect(screen()).toMatch(/onExitOrganisation=\{\(\) => enterOrganisation\(null\)\}/);
  });

  test("Android's back button returns to GNA before leaving the app", () => {
    expect(screen()).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
  });

  test("GNA's desks and desk swipe are not offered on an organisation's page", () => {
    expect(screen()).toMatch(/\.enabled\(!organisation\)/);
    expect(screen()).toMatch(
      /if \(!organisation && section && incident\.section !== section\) return false;/,
    );
  });
});

describe('one list of organisations, wherever one is chosen', () => {
  /*
   * The home search opens one; the last step of filing ticks several. Two
   * separate pickers is how the app ended up with two different search boxes for
   * the same list.
   */
  const list = () => code('features/organisations/OrganisationList.tsx');

  test('it searches, and says which of loading, failed and empty it is', () => {
    const src = list();
    expect(src).toMatch(/filterOrganisations\(organisations, query/);
    expect(src).toMatch(/destination\.loadingOrganisations/);
    expect(src).toMatch(/destination\.directoryFailedTitle/);
    expect(src).toMatch(/destination\.noOrganisationsTitle/);
    expect(src).toMatch(/destination\.forwardNoMatch/);
  });

  test('ticking several and opening one are the same list in two modes', () => {
    const src = list();
    expect(src).toMatch(/mode: 'single' \| 'multi'/);
    expect(src).toMatch(/accessibilityRole=\{mode === 'multi' \? 'checkbox' : 'button'\}/);
    expect(code('features/feed/SearchOverlay.tsx')).toMatch(/mode="single"/);
    expect(code('features/capture/ReviewScreen.tsx')).toMatch(/mode="multi"/);
  });

  test('it does not scroll inside whatever is scrolling it', () => {
    // A list in its own scroller, inside the screen's scroller, is the thing
    // that makes a list feel stuck halfway down.
    expect(list()).not.toMatch(/ScrollView|FlatList|FlashList/);
  });
});
