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

  test('two questions, two buttons, two screens', () => {
    /*
     * This asserted the opposite until now — one field under two tabs — and had
     * been failing since the design moved on without it.
     *
     * The tabs were the problem being fixed: one button opened a search that
     * might be about reports or about institutions, and finding an institution
     * meant first noticing a tab. The magnifier now asks "what happened" and the
     * building asks "who is on Dawuro".
     */
    expect(bar()).toMatch(/onPress=\{onOpenSearch\}/);
    expect(bar()).toMatch(/onPress=\{onOpenInstitutions\}/);

    const src = overlay();
    expect(src).toMatch(/<FeedRow/);
    // Reports only. An organisation list here would be the tab by another name.
    expect(src).not.toMatch(/<OrganisationList/);
  });

  test('each search screen has exactly one field', () => {
    /*
     * The recurring defect on this screen, in its third form. First a pill above
     * a sheet that held a second box; then two tabs sharing one field; then the
     * institutions overlay drew its own search bar *and* passed its query to
     * `OrganisationList`, which drew another — two identical boxes stacked, both
     * bound to the same state, so typing in either filled both.
     *
     * A screen that owns a search bar passes `showSearch={false}`.
     */
    const institutions = code('features/feed/InstitutionsOverlay.tsx');
    expect((institutions.match(/<TextInput/g) ?? []).length).toBe(1);
    expect(institutions).toMatch(/showSearch=\{false\}/);

    expect((overlay().match(/<TextInput/g) ?? []).length).toBe(1);

    /*
     * And the list still draws one where it is the only place to type — the last
     * step of filing embeds it inline with no bar of its own.
     */
    const list = code('features/organisations/OrganisationList.tsx');
    expect(list).toMatch(/showSearch = true/);
    expect(code('features/capture/ReviewScreen.tsx')).not.toMatch(/showSearch=\{false\}/);
  });

  test('closing the search leaves the feed exactly as it was', () => {
    // The query lives in the overlay, so nothing it typed filters the feed
    // underneath it once it is closed.
    expect(overlay()).toMatch(/const \[query, setQuery\] = useState\(''\);/);
    expect(screen()).not.toMatch(/const \[query, setQuery\]/);
  });

  test('choosing an organisation opens its homepage and closes the search', () => {
    /*
     * Asserted against `SearchOverlay` until now, and stale for the same reason
     * as the tabs above: choosing an organisation moved to the screen that lists
     * them when the two searches were split.
     */
    expect(code('features/feed/InstitutionsOverlay.tsx')).toMatch(
      /onClose\(\);\s*onOpenOrganisation\(id\);/,
    );
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
    // `single` moved to the institutions screen when the two searches split.
    expect(code('features/feed/InstitutionsOverlay.tsx')).toMatch(/mode="single"/);
    expect(code('features/capture/ReviewScreen.tsx')).toMatch(/mode="multi"/);
  });

  test('it does not scroll inside whatever is scrolling it', () => {
    // A list in its own scroller, inside the screen's scroller, is the thing
    // that makes a list feel stuck halfway down.
    expect(list()).not.toMatch(/ScrollView|FlatList|FlashList/);
  });
});
