import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * One story gets the width of the page.
 *
 * The feed was forty identical rows: every report had the same 112×86 thumbnail
 * and the same three lines, so the most important thing on the desk looked
 * exactly like the fortieth, and a reader opening the app had nothing to land
 * on. Every newspaper and every news app solves this the same way, because it
 * works — a lead, then the queue beneath it.
 *
 * Two decisions in it are worth keeping honest, and both are rules below.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the top stories are the top of the feed, not a score this client invented', () => {
  /*
   * The server orders the feed, and for a desk the top of it *is* the lead —
   * the judgement an editor already made when they published each one to a
   * section. Ranking them again here would be the phone second-guessing the
   * newsroom with a number it computed on its own.
   */
  const screen = code('features/feed/FeedScreen.tsx');
  expect(screen).toMatch(/visible\.slice\(0, topStoryCount\)/);
  expect(screen).toMatch(/rows = useMemo\(\(\) => visible\.slice\(leading\.length\)/);
});

test('a search has a first result, not a lead', () => {
  /*
   * Stamping "Top story" on whatever happened to match is the interface
   * asserting an editorial judgement nobody made.
   */
  const overlay = code('features/feed/SearchOverlay.tsx');
  expect(overlay).toMatch(/<FeedRow/);
  expect(overlay).not.toMatch(/TopStories|feed\.topStory/);
});

test('a top story never renders twice', () => {
  // They are the header *and* would be the first rows. Showing both is the same
  // report twice at two sizes, which reads as a bug rather than as a design.
  const screen = code('features/feed/FeedScreen.tsx');
  expect(screen).toMatch(/data=\{rows\}/);
  expect(screen).not.toMatch(/data=\{visible\}/);
});

test('the empty state does not fire underneath a lead', () => {
  // One report in a section is a feed with a lead and no rows — "nothing
  // matched" printed under it would contradict the story above it.
  expect(code('features/feed/FeedScreen.tsx')).toMatch(
    /ListEmptyComponent=\{\s*leading\.length > 0 \? null :/,
  );
});

test('footage says so before it is opened', () => {
  // A still and a clip are different things to commit to, and on a lead-sized
  // image the difference is worth a control-sized mark.
  const lead = code('features/feed/FeedLead.tsx');
  expect(lead).toMatch(/isAudio \? 'mic' : 'play'/);
});

test('a withheld location is absent, not placeheld', () => {
  /*
   * The same rule the row and the capture stamp follow: "Location hidden" on
   * the largest thing on the screen advertises that there was something to
   * hide.
   */
  const lead = code('features/feed/FeedLead.tsx');
  expect(lead).toMatch(/incident\.location\.label \? \(/);
  expect(lead).not.toMatch(/Location hidden|Unknown location/i);
});

test('exact sizes go through style, not arbitrary classes', () => {
  /*
   * Arbitrary Tailwind values do not compile in this NativeWind setup — the
   * feed row learned it when `w-[112px]` collapsed to nothing and the rows
   * rendered as bare text. A 16:9 lead image that collapses is the whole
   * feature gone.
   */
  const lead = code('features/feed/FeedLead.tsx');
  expect(lead).toMatch(/style=\{\{ width, height: imageHeight \}\}/);
  expect(lead).not.toMatch(/aspect-\[/);
});

test('the skeleton has a lead in it', () => {
  /*
   * Without one the feed loads as a list and then shoves everything down by the
   * height of a 16:9 image the moment data arrives — which reads as the screen
   * reloading rather than filling in, on the first thing anybody sees.
   */
  const skeleton = code('features/feed/FeedSkeleton.tsx');
  expect(skeleton).toMatch(/Math\.round\(width \* LEAD_IMAGE_RATIO\)/);
});

test('the eyebrow has words behind it', () => {
  expect((en.feed as Record<string, string>).topStory).toBeTruthy();
});

describe('the feed shows the footage, not a drawing of the category', () => {
  const poster = () => code('lib/videoPoster.ts');

  test('a frame is cut from the clip when the service sent no still', () => {
    /*
     * `media.posterUrl` is null for every video the platform holds, so
     * `Thumbnail` fell back to the bundled category artwork and a flood report
     * led with a picture of a raindrop instead of the thing somebody filmed.
     */
    expect(poster()).toMatch(/generateThumbnailsAsync\(\[FRAME_AT_SECONDS\]/);
    // Both the lead and the rows — a column of raindrops is the same defect at
    // a smaller size, and the queue below is what makes the rows affordable.
    for (const component of ['features/feed/FeedLead.tsx', 'features/feed/FeedRow.tsx']) {
      expect(code(component)).toMatch(/poster=\{poster\}/);
      expect(code(component)).toMatch(/useVideoPoster\(\{/);
    }
  });

  test('a frame that could not be stored is still shown', () => {
    /*
     * `writeToCacheAsync` is typed for `ImageRef` and a `VideoThumbnail` is a
     * different class, though both are a `SharedRef<'image'>` — the same native
     * object behind two sets of convenience getters. The cast is sound but
     * undocumented, so it is not allowed to cost the reader a picture: the live
     * frame is drawn instead, which `<Image source>` accepts by its published
     * type, and the cost of being wrong is a re-cut next launch, not a blank.
     */
    expect(poster()).toMatch(/return \(await store\(incidentId, frame\)\) \?\? frame/);
  });

  test('the clip is loaded before a frame is asked for', () => {
    /*
     * The rule this whole mechanism failed on first time out.
     *
     * `createVideoPlayer` returns before the source has loaded, and a player
     * that has buffered nothing has no frame to give — so the first version
     * returned null every time and the feed still showed category artwork,
     * which looked exactly like the bug it was written to fix.
     */
    expect(poster()).toMatch(/await playable\(player\)/);
    expect(poster()).toMatch(/status === 'readyToPlay'/);
    // And it cannot wait forever: a dead URL would hold the queue closed.
    expect(poster()).toMatch(/READY_TIMEOUT_MS/);
  });

  test('a frame is taken once per report, ever', () => {
    /*
     * Taking a frame means pulling the head of a video down a mobile
     * connection, and the people using this app pay for those megabytes by the
     * bundle. The disk is checked before any player is built, so the second
     * launch costs nothing — and an expired signature on the original URL does
     * not matter, because nothing goes back to the network for it.
     */
    expect(poster()).toMatch(/getCachePathAsync\(cacheKeyFor\(incidentId\)\)/);
    expect(poster()).toMatch(/writeToCacheAsync\([\s\S]{0,40}, cacheKeyFor\(incidentId\)\)/);
  });

  test('twenty rows are not twenty simultaneous downloads', () => {
    /*
     * The reason rows can have this at all. A feed renders twenty items at
     * once; twenty players seeking twenty remote files in parallel would
     * saturate the connection and leave the list stuttering.
     */
    expect(poster()).toMatch(/const MAX_ACTIVE = 1/);
    expect(poster()).toMatch(/while \(!isCameraActive\(\) && active < MAX_ACTIVE/);
  });

  test('a re-render does not queue the same report twice', () => {
    // `requestPoster` is called from render-driven effects on every row.
    expect(poster()).toMatch(
      /if \(known\.has\(incidentId\) \|\| claimed\.has\(incidentId\)\) return/,
    );
  });

  test('every player is released, including the ones that failed to load', () => {
    /*
     * `createVideoPlayer` hands the lifetime to us and the SDK is explicit that
     * not releasing leaks. A clip that times out is exactly the case a `try`
     * body would miss.
     */
    expect(poster()).toMatch(
      /\} finally \{\s*\n\s*(\/\/[^\n]*\n\s*)*(\*[^\n]*\n\s*)*player\.release\(\)/,
    );
  });

  test('a failure is remembered for the launch but not written to disk', () => {
    /*
     * A codec the device cannot decode, a signature that expired between the
     * feed loading and this running, or a clip shorter than the offset. Cached
     * in memory so a feed scrolled twice does not re-seek an unreadable file —
     * and deliberately not on disk, because a miss caused by an expired URL
     * should be retried next launch rather than made permanent.
     */
    expect(poster()).toMatch(/known\.set\(job\.id, null\)/);
  });

  test('it is asked for only where there is a clip and nothing standing in', () => {
    // A report the service *did* give a poster for must not be re-seeked, and a
    // photo has no frames to take. If the backend starts generating posters,
    // this goes false everywhere and the mechanism stops running on its own.
    expect(code('hooks/useVideoPoster.ts')).toMatch(
      /input\.kind === 'video' && !input\.posterUrl && Boolean\(input\.url\)/,
    );
  });
});

test('overlay offsets go through style, not utility classes', () => {
  /*
   * `bottom-4` was used nowhere else in the app, and NativeWind compiles
   * `global.css` at Metro boot — a class it has never seen is not in the sheet
   * and the rule is dropped in silence. An absolutely positioned React Native
   * view with no `bottom` falls back to its static position, which put the play
   * badge at the top of the lead, on top of the eyebrow. No error, and it
   * survives a reload.
   */
  const lead = code('features/feed/FeedLead.tsx');
  expect(lead).toMatch(/OVERLAY_BOTTOM_LEFT = \{ position: 'absolute', bottom: 16, left: 16 \}/);
  expect(lead).not.toMatch(/absolute bottom-4/);
});

describe('the top of the feed rotates', () => {
  const carousel = () => code('features/feed/TopStories.tsx');

  /*
   * A newsroom's front page has never had one lead. Several stories share the
   * top slot and take turns, because on a phone the width of one story is the
   * width of the screen — so the choice is between showing one and showing
   * several over time.
   *
   * Auto-advancing carousels are among the most disliked patterns anywhere, and
   * almost always for reasons that are fixable. Each rule below is one of them.
   */

  test('it stops the moment a finger lands, not when the swipe finishes', () => {
    /*
     * The first and worst complaint: it moves while you are reading it. Waiting
     * for the swipe to end would still let a turn expire under a thumb that is
     * already on the glass.
     */
    expect(carousel()).toMatch(/onScrollBeginDrag=\{\(\) => setHeld\(true\)\}/);
    expect(carousel()).toMatch(/if \(count < 2 \|\| held \|\| !focused \|\| reduceMotion\) return/);
  });

  test('a pause cancels the turn rather than shortening it', () => {
    /*
     * The timer is rebuilt from its conditions, so letting go starts a fresh
     * full turn. A single interval ticking underneath would hand the reader
     * whatever was left of the last one.
     */
    expect(carousel()).toMatch(/const timer = setTimeout\(/);
    expect(carousel()).toMatch(/return \(\) => clearTimeout\(timer\)/);
    expect(carousel()).toMatch(
      /\}, \[count, held, focused, reduceMotion, index, width, dwell, started\]\)/,
    );
  });

  test('it does not move on its own for a reader who asked for less motion', () => {
    /*
     * Not a downgrade: every story is still reachable by swiping, which is how
     * that reader would have reached them anyway. Subscribed rather than read
     * once, because it is a system setting that changes while the app is open.
     */
    expect(carousel()).toMatch(/AccessibilityInfo\.isReduceMotionEnabled\(\)/);
    expect(carousel()).toMatch(/addEventListener\('reduceMotionChanged', setReduceMotion\)/);
  });

  test('it stops when the screen is not in front of anybody', () => {
    // A carousel ticking under the profile tab is battery spent on nothing.
    expect(carousel()).toMatch(/useFocusEffect\(/);
    expect(carousel()).toMatch(/return \(\) => setFocused\(false\)/);
  });

  test('the position comes from the scroll, not from the timer', () => {
    /*
     * A swipe and an automatic advance disagreeing about which story is showing
     * is how a carousel ends up jumping backwards under somebody's thumb.
     */
    expect(carousel()).toMatch(/event\.nativeEvent\.contentOffset\.x \/ width/);
    // A slow swipe ends with no momentum and must still settle.
    expect(carousel()).toMatch(/onScrollEndDrag=\{settle\}/);
  });

  test('one story is a lead, not a rotation of one', () => {
    // No timer, and no dots — they would be furniture for a rotation that
    // cannot rotate.
    expect(carousel()).toMatch(/count < 2 \|\|/);
    expect(carousel()).toMatch(/count > 1 \? \(/);
  });

  test('the reader can tell how many there are and which this is', () => {
    // Not knowing that anything is rotating, or how much has been missed, is
    // the complaint the dots exist to answer.
    expect(carousel()).toMatch(/position === index \? 14 : 6/);
  });
});

describe('how many stories lead, and for how long', () => {
  const settings = () => code('features/feed/topStorySettings.ts');

  test('a served value is clamped before it reaches a reader', () => {
    /*
     * Both ends of the range are things a typo in an admin field produces:
     * zero stories empties the top of the feed, 200ms is a strobe, and an hour
     * is a carousel that never moves while claiming to.
     */
    expect(settings()).toMatch(/export function sanitise\(/);
    expect(settings()).toMatch(/DWELL_MS_RANGE = \{ min: 3000, max: 20_000 \}/);
    expect(settings()).toMatch(/COUNT_RANGE = \{ min: 1, max: 5 \}/);
  });

  test('a non-number falls back rather than rendering NaN', () => {
    // `setTimeout(fn, NaN)` fires immediately, which is the strobe again by
    // another route.
    expect(settings()).toMatch(/typeof value !== 'number' \|\| !Number\.isFinite\(value\)/);
  });

  test("the desk's value comes from the service, through one hook", () => {
    /*
     * `GET /v1/settings` carries the count and dwell now. Both screens read
     * them through the same hook, so the served value reaches the rotation and
     * the split between leads and rows together.
     */
    expect(settings()).toMatch(/fetch\(`\$\{origin\}\/v1\/settings`/);
    expect(settings()).toMatch(/served = sanitise\(\{/);
    for (const rel of ['features/feed/FeedScreen.tsx', 'features/feed/TopStories.tsx']) {
      expect([rel, /useTopStorySettings\(\)/.test(code(rel))]).toEqual([rel, true]);
    }
  });

  test('the defaults stand until the service answers, and if it never does', () => {
    // A stable object, or `useSyncExternalStore` re-renders the feed forever.
    expect(settings()).toMatch(/return served \?\? DEFAULTS;/);
    expect(settings()).toMatch(/process\.env\.EXPO_PUBLIC_API_MODE !== 'http'/);
  });
});

describe("the service's own image copies are used", () => {
  test('rows and grid tiles draw the 320px thumb, falling back to the poster', () => {
    expect(code('features/feed/FeedRow.tsx')).toMatch(
      /const still = incident\.media\.thumbUrl \|\| incident\.media\.posterUrl/,
    );
    expect(code('features/profile/ReportGrid.tsx')).toMatch(
      /const still = report\.media\.thumbUrl \|\| report\.media\.posterUrl/,
    );
  });

  test('a full-width slide draws the 1280px view', () => {
    expect(code('features/feed/FeedLead.tsx')).toMatch(
      /const still = incident\.media\.viewUrl \|\| incident\.media\.posterUrl/,
    );
  });

  test('the copies are made absolute at the boundary, and null stays null', () => {
    const http = code('api/http.ts');
    expect(http).toMatch(/thumbUrl: raw\.media\.thumbUrl \? absoluteMedia\(raw\.media\.thumbUrl\) : null/);
    expect(http).toMatch(/viewUrl: raw\.media\.viewUrl \? absoluteMedia\(raw\.media\.viewUrl\) : null/);
  });
});

describe('a video top story plays before it slides', () => {
  const carousel = () => code('features/feed/TopStories.tsx');
  const lead = () => code('features/feed/FeedLead.tsx');

  test('only the slide on screen has a source', () => {
    /*
     * Five leads are mounted so the rotation can slide without a blank frame.
     * Five players pulling five clips at once would cost a reader several
     * megabytes for four stories they never saw — on bundles people ration.
     * A null source is the documented way to have a player do nothing.
     */
    expect(lead()).toMatch(
      /!cameraActive && \(playing \|\| preload\) && isVideo && incident\.media\.url\s*\?\s*incident\.media\.url\s*:\s*null/,
    );
    expect(carousel()).toMatch(/playing=\{motion && position === index\}/);
  });

  test('playback is driven by an effect, not the setup callback', () => {
    /*
     * The bug that made this feature do nothing at all.
     *
     * `useVideoPlayer(source, setup)` runs the setup **once, at creation**. All
     * five slides mount together with `playing` false, so every player is built
     * against a null source and its setup fires then — and when a slide later
     * becomes the one on screen, the source is replaced and the setup is never
     * called again. `play()` in there meant only the first slide ever moved,
     * and even that raced the file loading. Nothing errored; the rotation
     * showed five still frames.
     */
    const source = lead();
    expect(source).toMatch(/if \(!source\) \{\s*setWaiting\(false\);\s*return;/);
    expect(source).toMatch(/player\.play\(\);/);
    const setup = source.slice(source.indexOf('useVideoPlayer('), source.indexOf('useEffect('));
    expect(setup).not.toMatch(/\.play\(\)/);
  });

  test('a story that comes round again starts from the beginning', () => {
    // Not the last second of the clip, frozen where the previous turn stopped.
    expect(lead()).toMatch(/player\.currentTime = 0/);
  });

  test('leaving a slide stops its clip', () => {
    // Four paused players behind the one on screen, not four running ones.
    // Guarded: the native player may already be released when the slide unmounts.
    expect(lead()).toMatch(
      /safely\(\(\) => player\.pause\(\)\);\s*\}\;\s*\}, \[source, player, playing\]\)/,
    );
  });

  test('it never makes a sound', () => {
    /*
     * Sound starting on its own in a feed is hostile — a reader in a lorry, a
     * clinic or a meeting did not ask for it, and on a report about a
     * confrontation it is worse than hostile.
     */
    expect(lead()).toMatch(/instance\.muted = true/);
  });

  test('it does not loop', () => {
    // The rotation moves on when the preview ends. A clip restarting under a
    // slide that is about to leave is motion for its own sake.
    expect(lead()).toMatch(/instance\.loop = false/);
  });

  test('the preview is the slide dwell, not an addition to it', () => {
    // Otherwise the rotation sits on a clip that has stopped playing, which is
    // the deadest thing a moving lead can do.
    expect(carousel()).toMatch(
      /!isVideoSlide \? dwellMs : started \? VIDEO_PREVIEW_MS : VIDEO_START_TIMEOUT_MS/,
    );
    expect(carousel()).toMatch(/\}, dwell\)/);
  });

  test('footage stops for a reader who asked for less motion', () => {
    /*
     * A carousel that has stopped advancing but is still playing video
     * underneath honours the letter of that setting and none of its point.
     */
    expect(carousel()).toMatch(/const motion = !reduceMotion && focused;/);
  });

  test('the still stays underneath rather than being replaced', () => {
    // Something to show for the moment before the first frame arrives, and
    // something to fall back to if the file will not play at all.
    const source = lead();
    expect(source.indexOf('<Thumbnail')).toBeLessThan(source.indexOf('<VideoView'));
  });

  test('the clip does not take the tap that opens the report', () => {
    // The whole slide is one target. A scrubber here would sit between the
    // reader and the story.
    expect(lead()).toMatch(/nativeControls=\{false\}/);
    expect(lead()).toMatch(/pointerEvents="none"/);
  });

  test('the rest of the feed still autoplays nothing', () => {
    // The lead is one item and the strongest thing a news app can put at the
    // top of a feed. Forty rows doing it is a different product.
    expect(code('features/feed/FeedRow.tsx')).not.toMatch(/useVideoPlayer|VideoView/);
  });
});

describe('the feed is shaped like the news apps people already read', () => {
  /*
   * Asked for by pointing at one: a dark bar with a menu and a title, uppercase
   * section tabs with an underline, a full-bleed lead with a large headline and
   * a timestamp beneath it, then rows with the picture on the left and one line
   * of when and where.
   */
  const bar = () => code('features/feed/FeedBar.tsx');
  const row = () => code('features/feed/FeedRow.tsx');
  const lead = () => code('features/feed/FeedLead.tsx');

  test('the bar is a menu, the GNA mark and a title', () => {
    expect(bar()).toMatch(/name="menu"/);
    // The supplied lockup, on its own white tile: its lettering is dark and the
    // bar is black, so laid straight on it the agency's name would vanish.
    expect(bar()).toMatch(/<GnaHomeLogo height=\{24\}/);
    /*
     * No tile: the mark's lettering is recoloured for a dark ground, so it sits
     * straight on the black bar. A white badge on a black masthead was the
     * supplied file's dark lettering showing through the workaround.
     */
    expect(bar()).not.toMatch(/bg-white/);
    // And it is the supplied wordmark, not the older lockup with the drums.
    expect(code('components/Brand.tsx')).toMatch(
      /GnaHomeLogo[\s\S]{0,600}assets\/brand\/gna-home\.png/,
    );
    // The mark alone: no word beside it naming the screen.
    expect(bar()).not.toMatch(/feedsTitle/);
  });

  test('nothing the bar used to carry has been lost', () => {
    // Slides, the organisation directory and the map moved into the menu rather
    // than disappearing.
    const source = bar();
    for (const handler of ['onOpenSlides', 'onOpenBusinesses', 'onOpenMap']) {
      expect([handler, source.includes(`choose(${handler})`)]).toEqual([handler, true]);
    }
    // Search is the one that did not: it is its own control in the bar, which is
    // where every app people already read puts it.
    expect(source).toMatch(/onPress=\{onOpenSearch\}/);
  });

  test('the menu closes before it opens anything', () => {
    // Otherwise the next screen opens underneath a sheet still on screen.
    expect(bar()).toMatch(/setMenuOpen\(false\);\s*action\(\);/);
  });

  test('the lead has no badge over its picture', () => {
    expect(lead()).not.toMatch(/feed\.topStory/);
    expect(lead()).not.toMatch(/OVERLAY_TOP_LEFT/);
  });

  test('the lead headline is large, but not so large it crowds the slide', () => {
    // Reduced from 22/29: the slide was taking most of a small screen.
    expect(lead()).toMatch(/fontSize: 18, lineHeight: 24/);
    expect(lead()).toMatch(/Math\.round\(width \* LEAD_IMAGE_RATIO\)/);
  });

  test('slide footage is cached on the phone', () => {
    // Otherwise every pass of the rotation downloads the clip from the start.
    expect(lead()).toMatch(/\{ uri: source, useCaching: true \}/);
    expect(code('lib/videoPoster.ts')).toMatch(/createVideoPlayer\(\{ uri: url, useCaching: true \}\)/);
  });

  test('a row picture is a share of the screen, not a fixed size', () => {
    // So it keeps its proportion on a small phone and a large one.
    expect(row()).toMatch(/Math\.round\(width \* 0\.4\)/);
  });

  test('a row says when, then where', () => {
    expect(row()).toMatch(/`\$\{when\}  •  \$\{where\}`/);
  });

  test('where falls back to what it is, never to a placeholder', () => {
    // A reporter who withheld a location is not advertised as having done so.
    expect(row()).toMatch(/placeOf\(incident\) \?\? t\(`category\.\$\{incident\.category\}`\)/);
    expect(row()).not.toMatch(/Location hidden|Unknown location/i);
  });

  test('rows are separated by space, not rules', () => {
    expect(code('features/feed/FeedScreen.tsx')).not.toMatch(/ItemSeparatorComponent/);
  });
});

describe('a video top story gets five seconds of actual footage', () => {
  /*
   * Reported as the rotation showing thumbnails that never moved. The preview
   * was timed from when a slide appeared, and a clip only began loading once
   * its slide was on screen — so over mobile data the slide moved on before
   * the first frame had even arrived.
   */
  const carousel = () => code('features/feed/TopStories.tsx');
  const lead = () => code('features/feed/FeedLead.tsx');
  const settings = () => code('features/feed/topStorySettings.ts');

  test('five seconds', () => {
    expect(settings()).toMatch(/VIDEO_PREVIEW_MS = 5000/);
  });

  test('timed from when the footage moves, not from when the slide appears', () => {
    expect(lead()).toMatch(/addListener\('playingChange'/);
    expect(lead()).toMatch(/if \(isPlaying\) \{\s*setWaiting\(false\);\s*startedRef\.current\?\.\(\);/);
    expect(carousel()).toMatch(/startedId === showing\?\.id/);
  });

  test('a clip that is already moving still announces it', () => {
    // Preloaded to readiness, it can be playing before the listener exists.
    expect(lead()).toMatch(
      /if \(safely\(\(\) => player\.playing\)\) \{\s*setWaiting\(false\);\s*startedRef\.current\?\.\(\);/,
    );
  });

  test('the next slide buffers while this one plays, and only the next', () => {
    expect(carousel()).toMatch(
      /preload=\{motion && count > 1 && position === \(index \+ 1\) % count\}/,
    );
  });

  test('a buffering slide is held still, not played', () => {
    expect(lead()).toMatch(
      /if \(!playing\) \{\s*setWaiting\(false\);\s*safely\(\(\) => player\.pause\(\)\);\s*return;/,
    );
  });

  test('a clip that never starts cannot stall the rotation', () => {
    expect(settings()).toMatch(/VIDEO_START_TIMEOUT_MS = 8000/);
  });

  test('a changing callback does not restart the clip', () => {
    // The rotation re-renders on every scroll event; depending on the callback
    // would seek the footage back to zero each time.
    expect(lead()).toMatch(/const startedRef = useRef\(onPlaybackStarted\)/);
    expect(lead()).not.toMatch(/\[source, player, playing, onPlaybackStarted\]/);
  });

  test('coming round again starts the count afresh', () => {
    expect(carousel()).toMatch(/setStartedId\(null\);\s*setIndex\(next\)/);
  });
});
