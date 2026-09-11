import fs from 'fs';
import path from 'path';

/**
 * Watching a report back.
 *
 * Two screens showed footage and neither could play it, for the same reason and
 * with the same appearance: a single `expo-image` for every report.
 * `expo-image` cannot decode an MP4 — it fails with no error and no
 * broken-image state — so a video rendered as a black rectangle. On the detail
 * screen a play button was drawn over it with `pointerEvents="none"`: it looked
 * like the way to start the video and could not be pressed, and there was
 * nothing else to try.
 *
 * This is the third copy of the same defect. It was fixed in the capture
 * preview and in the console's `MediaFrame` before anyone noticed it here,
 * which is why these rules read from source rather than from a render: what
 * matters is that no screen goes back to putting a video in an `<Image>`.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Comments removed, so a rule cannot pass by matching the note explaining it. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const STAGE = 'features/incident/IncidentStage.tsx';
const DETAIL = 'features/incident/IncidentDetailScreen.tsx';

test('a video is given a player, not an image', () => {
  const stage = code(STAGE);
  expect(stage).toMatch(/from 'expo-video'/);
  expect(stage).toMatch(/<VideoView/);
  expect(stage).toMatch(/useVideoPlayer\(/);

  /*
   * And the branch is reachable. Asserting only that `<VideoView` appears in
   * the file passes on a player behind `if (false)` — the component still
   * imports expo-video, still mentions the tag, and still renders every video
   * through the image at the bottom. The gate has to be the media kind.
   */
  expect(stage).toMatch(/if \(isVideo\) \{/);
  const videoBranch = stage.indexOf('if (isVideo) {');
  expect(stage.indexOf('<VideoView')).toBeGreaterThan(videoBranch);
});

test('the reader can actually play, pause and scrub', () => {
  /*
   * `nativeControls` is the whole of it. Without transport there is no way to
   * pause a clip, go back three seconds, or stop it — on a screen whose entire
   * purpose is watching the thing.
   */
  expect(code(STAGE)).toMatch(/nativeControls/);
});

test('the decorative play button is gone', () => {
  /*
   * It was `pointerEvents="none"` over a frame that never rendered: a control
   * that could not be pressed, standing in for one that did not exist. Leaving
   * it beside real controls would be two play buttons, one of them a lie.
   */
  const detail = code(DETAIL);
  expect(/pointerEvents="none"[\s\S]{0,240}name="play"/.test(detail)).toBe(false);
});

test('the detail screen no longer renders media through one element', () => {
  const detail = code(DETAIL);
  expect(detail).toMatch(/<IncidentStage/);
  // The exact call that could never render a video.
  expect(detail).not.toMatch(/<Image\s+source=\{\{ uri: incident\.media\.url \}\}/);
});

test('the caption is lifted clear of the transport on a video', () => {
  /*
   * The native controls sit across the bottom of the player, which is exactly
   * where the caption was — and the caption is interactive, so it takes the
   * taps meant for play and the scrubber. It cannot simply be made
   * non-interactive: the publisher's name opens their page.
   */
  expect(code(DETAIL)).toMatch(/media\.kind === 'video' \? 92 : 20/);
});

test('a player that fails is heard, not left on a black frame', () => {
  /*
   * `VideoView` has no `onError`; the documented route is the player's own
   * `statusChange`. Without it an unopenable video is a black rectangle with no
   * explanation — the failure this component exists to end.
   */
  const stage = code(STAGE);
  expect(stage).toMatch(/useEvent\(player, 'statusChange'/);
  expect(stage).toMatch(/status === 'error'/);
});

test('a file too small to be footage is named rather than played', () => {
  /*
   * The service stores integration probes beside real reports — 2 048 or 8 192
   * bytes of filler with no container header. A player handed one shows 0:00 on
   * black forever, which a reader cannot tell from a slow connection.
   */
  const stage = code(STAGE);
  expect(stage).toMatch(/bytes < MIN_PLAUSIBLE_MEDIA_BYTES/);
  expect(stage).toMatch(/not playable/i);

  /*
   * And nothing is ever played for it. Matching the message alone passed with
   * the check disabled: the sentence stayed in the source, unreachable, while
   * every probe payload went straight to a player that showed 0:00 on black.
   *
   * `playable` is the single gate — it decides whether the player is given a
   * source at all — so a `notMedia` file cannot reach one.
   */
  expect(stage).toMatch(/const playable = isVideo && !notMedia;/);
  expect(stage).toMatch(/const source = playable &&/);
  expect(stage).toMatch(/if \(notMedia \|\| failed \|\| playbackFailed\)/);
});

test('the failure message does not call every report a photo', () => {
  // One sentence covered three failures and was wrong about the word "photo"
  // on every video.
  expect(read(STAGE)).toMatch(/isVideo \? 'video' : 'photo'/);
});

test('a portrait clip is not cropped to fit a landscape stage', () => {
  // This is evidence. The parts a crop removes may be the parts that matter.
  expect(code(STAGE)).toMatch(/contentFit="contain"/);
});

// ─── the reporter's own reports ────────────────────────────────────────────

test('opening your own report shows the footage, not just a status', () => {
  /*
   * The sheet showed the outcome timeline and nothing else — four lines saying
   * where a report had got to, with no sight of the thing itself. Somebody
   * tapping their own footage expects to watch it back, and the tile they
   * tapped had just shown them a thumbnail of it.
   */
  const sheet = code('features/profile/ReportSheetBody.tsx');
  expect(sheet).toMatch(/<IncidentStage/);
  expect(sheet).toMatch(/<ReportOutcomeTimeline/);
  expect(code('features/profile/ProfileScreen.tsx')).toMatch(/<ReportSheetBody/);
});

test('an unpublished report is not sent to the public page', () => {
  /*
   * `GET /incidents/{id}` serves published reports. Routing there would work
   * for exactly the reports a reporter is least worried about and refuse the
   * ones under review — the half this screen exists for. So the sheet is built
   * from the record `/me/incidents` already returned, and the link out is
   * offered only where there is a public page to open.
   */
  const sheet = code('features/profile/ReportSheetBody.tsx');
  expect(sheet).toMatch(/vettingState === 'published' \?/);

  const linkAt = sheet.indexOf('router.push(`/incident/');
  const guardAt = sheet.indexOf("vettingState === 'published' ?");
  expect(linkAt).toBeGreaterThan(guardAt);
});

// ─── streaming, now that the service supports ranges ───────────────────────

/**
 * The download is gone, and it was always meant to be.
 *
 * `GET /v1/media/{id}` did not support HTTP byte ranges — `Range: bytes=0-99`
 * answered 200 with the whole body and no `Content-Range` — and iOS
 * `AVPlayer` requires ranges to open a remote asset at all. So the whole file
 * was fetched to disk and played from there: correct, and several megabytes and
 * a spinner before a single frame moved.
 *
 * The service now answers `Accept-Ranges: bytes` and a 206 with
 * `Content-Range`, measured against it directly. The player takes the URL, the
 * clip starts on its first frames, and seeking no longer downloads what it
 * skips. `services/remoteMedia` is deleted.
 */

test('the player is given the URL, not a file on disk', () => {
  const stage = code(STAGE);
  expect(stage).toMatch(/useVideoPlayer\(source/);
  expect(stage).toMatch(
    /const source = playable && incident\.media\.url \? incident\.media\.url : null/,
  );
});

test('nothing is fetched ahead of playback any more', () => {
  /*
   * The workaround in full: a module, a cache directory, a download, a
   * temporary name, a size check and a spinner. All of it existed for one
   * missing HTTP feature, and none of it should survive that feature arriving.
   */
  const stage = code(STAGE);
  for (const gone of [
    'downloadMedia',
    'cachedMedia',
    'remoteMedia',
    'localUri',
    'downloadFailed',
  ]) {
    expect([gone, stage.includes(gone)]).toEqual([gone, false]);
  }
  expect(fs.existsSync(path.join(SRC, 'services', 'remoteMedia.ts'))).toBe(false);
});

test('a photo is never handed to the player', () => {
  /*
   * `source` is null for anything that is not playable footage, so a photo and
   * a two-kilobyte probe cannot reach a player that would sit on them at 0:00
   * — the same gate the download used to be behind.
   */
  const stage = code(STAGE);
  expect(stage).toMatch(/const playable = isVideo && !notMedia;/);
  expect(stage).toMatch(/playable && incident\.media\.url \? incident\.media\.url : null/);
});

test('buffering is said out loud rather than shown as black', () => {
  /*
   * Shorter than it was — the stream starts on the first frames rather than the
   * last byte — but on a mobile connection still long enough that silence reads
   * as broken.
   */
  const stage = code(STAGE);
  expect(stage).toMatch(/status\?\.status === 'loading' \|\| status\?\.status === 'idle'/);
  expect(stage).toMatch(/Loading the footage/);
});

test('a stream that fails is still heard', () => {
  /*
   * The one failure route left. An expired signature, a dead connection or a
   * file the player cannot decode all arrive as the same `statusChange` error,
   * and the reader is told rather than left on a black frame.
   */
  const stage = code(STAGE);
  expect(stage).toMatch(/const playbackFailed = Boolean\(source\) && status\?\.status === 'error'/);
  expect(stage).toMatch(/if \(notMedia \|\| failed \|\| playbackFailed\)/);
});
