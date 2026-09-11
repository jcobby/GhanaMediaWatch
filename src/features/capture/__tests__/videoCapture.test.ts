import fs from 'fs';
import path from 'path';

/**
 * Filming something, and being able to see it back.
 *
 * Two failures, reported together. "Nothing was recorded — the file came back
 * empty" on footage the reporter had just watched themselves film, and a blank
 * grey preview under the words "This is exactly how your report appears to
 * other people".
 *
 * They have different causes and one shape: an element or an API used for
 * something it cannot do, failing without an error.
 *
 * Read from source rather than rendered. These are camera and player calls that
 * need a device, and what matters is that the guards are on the path at all.
 */

const CAPTURE = path.resolve(__dirname, '..');
const read = (name: string) => fs.readFileSync(path.join(CAPTURE, name), 'utf8');

/** Comments removed, so a rule cannot pass by matching the note explaining it. */
const code = (name: string) =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ─── the preview ───────────────────────────────────────────────────────────

test('a video preview uses a player, not an image', () => {
  /*
   * The whole preview was one `expo-image`, and `expo-image` cannot decode an
   * MP4 — it fails silently, with no error and no broken-image state. A video
   * report showed an empty grey box, so a reporter could not check their own
   * footage before committing to it, and could not tell a blank preview from a
   * failed recording.
   */
  const preview = code('CapturePreview.tsx');
  expect(preview).toMatch(/from 'expo-video'/);
  expect(preview).toMatch(/<VideoView/);

  const videoBranch = preview.slice(preview.indexOf("kind === 'video'", preview.indexOf('return')));
  expect(videoBranch).toMatch(/<VideoView/);
});

test('the review screen no longer renders media through one element', () => {
  const review = code('ReviewScreen.tsx');
  expect(review).toMatch(/<CapturePreview/);
  // The exact call that could not render a video.
  expect(review).not.toMatch(/<Image\s+source=\{\{ uri: pending\.uri \}\}/);
});

test('the preview plays without asking, and without sound', () => {
  /*
   * A paused player on a local file renders black until it is touched, which is
   * the blank box again by another route. Muted because this is a thumbnail
   * that happens to move, shown while somebody types a description.
   */
  const preview = code('CapturePreview.tsx');
  expect(preview).toMatch(/instance\.play\(\)/);
  expect(preview).toMatch(/instance\.muted = true/);
});

test('the player hook is never called conditionally', () => {
  /*
   * `useVideoPlayer` is a hook. Putting it behind the `kind === 'video'` test
   * would break the rules of hooks on every photo report — so it takes a null
   * source instead, which the API accepts.
   */
  const preview = code('CapturePreview.tsx');
  const hook = preview.indexOf('useVideoPlayer(');
  const firstReturn = preview.indexOf('return', preview.indexOf('const c = useColors'));
  expect(hook).toBeGreaterThan(-1);
  expect(hook).toBeLessThan(firstReturn);
});

// ─── the recording ─────────────────────────────────────────────────────────

test('recording waits for the camera session to exist', () => {
  /*
   * `recordAsync` resolves "when the camera preview stops" — so a recording
   * started against a session that is still configuring ends the instant the
   * preview settles and writes a zero-byte file. No error, just an empty
   * capture discovered later.
   */
  const stage = code('CameraStage.tsx');
  expect(stage).toMatch(/onCameraReady=\{/);
  const start = stage.slice(stage.indexOf('const handleVideoStart'));
  expect(start).toMatch(/!cameraReady/);
});

test('the readiness gate cannot deadlock recording', () => {
  /*
   * Reversed, and the reversal is the point.
   *
   * Readiness was tracked as *which mode* was ready, on the assumption that
   * `onCameraReady` fires again when the `mode` prop changes. The SDK does not
   * document that — and if it does not fire again, the flag never reaches
   * 'video' and recording is blocked for the rest of the session. Reported as
   * "when I hold to record it doesn't record again", which is exactly what a
   * permanently closed gate looks like.
   *
   * A boolean cannot deadlock, and it is the documented meaning of the event:
   * "camera preview has been set".
   */
  const stage = code('CameraStage.tsx');
  expect(stage).toMatch(/setCameraReady\(true\)/);
  expect(stage).not.toMatch(/readyMode/);
});

test('a still also waits for the camera', () => {
  // The SDK is explicit that taking a picture requires the ready event.
  const start = code('CameraStage.tsx');
  const photo = start.slice(start.indexOf('const handlePhoto'));
  expect(photo).toMatch(/!cameraReady/);
});

test('a recording is never stopped before it has written anything', () => {
  /*
   * A tap that starts and ends inside the same second gives the encoder no
   * frames to mux, and produces a file of zero bytes rather than an error.
   */
  const stage = code('CameraStage.tsx');
  // The wait lives in `stopRecording`, which every route to a stop goes
  // through — the tap, the duration cap, and the delayed stop itself.
  const stop = stage.slice(stage.indexOf('const stopRecording'));
  expect(stop).toMatch(/MIN_VIDEO_DURATION_S/);
  expect(stop).toMatch(/setTimeout/);
});

test('the minimum is a real duration, and below the maximum', () => {
  // Zero would restore the bug; a large value would feel broken.
  const constants = fs.readFileSync(path.resolve(CAPTURE, '../../lib/constants.ts'), 'utf8');
  const min = Number(/MIN_VIDEO_DURATION_S = (\d+)/.exec(constants)?.[1]);
  const max = Number(/MAX_VIDEO_DURATION_S = (\d+)/.exec(constants)?.[1]);
  expect(min).toBeGreaterThan(0);
  expect(min).toBeLessThan(max);
});

test('an empty capture is named, not shown as a blank frame', () => {
  /*
   * A recording that wrote no bytes and a player that has not yet drawn its
   * first frame look identical — a grey rectangle. The difference matters:
   * one is worth waiting for, the other has to be filmed again.
   *
   * The app already knew, but only checked at submit, so somebody could write
   * a description and choose a destination for footage that did not exist,
   * under the words "This is exactly how your report appears to other people".
   */
  const preview = code('CapturePreview.tsx');
  expect(preview).toMatch(/fileSize\(uri\)/);
  expect(preview).toMatch(/bytes === 0/);
  expect(preview).toMatch(/Film it again/);
});

test('an empty file is never handed to the player', () => {
  // Loading nothing is how the blank frame happened in the first place.
  const preview = code('CapturePreview.tsx');
  expect(preview).toMatch(/kind === 'video' && bytes > 0 \? uri : null/);
});

test('the empty check runs before every branch', () => {
  /*
   * Ordered: a zero-byte photo, video or voice note all get the same answer.
   * Behind the `kind === 'audio'` branch it would miss two of the three.
   */
  const preview = code('CapturePreview.tsx');
  expect(preview.indexOf('bytes === 0')).toBeLessThan(preview.indexOf("kind === 'audio'"));
});

test('a preview that cannot draw says so, and gives the one useful fact', () => {
  /*
   * Four different problems shared one appearance: an empty file, a player
   * still warming up, a failed decode, and a wrong path all rendered the same
   * grey rectangle — under the words "This is exactly how your report appears
   * to other people".
   *
   * The size separates "empty" from "unreadable", which is the first thing
   * anybody debugging this would ask for.
   */
  const preview = code('CapturePreview.tsx');
  expect(preview).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
  expect(preview).toMatch(/bytes === 0 \|\| failed/);
  expect(preview).toMatch(/could not be opened/);
  expect(preview).toMatch(/The file is 0 bytes|KB/);
});

test('the whole capture is shown, not a crop of it', () => {
  /*
   * The preview was a 288px landscape box with the media cropped to fill it, so
   * a reporter reviewing a portrait phone video saw a slice through the middle
   * of their own footage and sent it without ever seeing the top or bottom.
   * A capture is reviewed once, before it is committed to permanently.
   */
  const preview = code('CapturePreview.tsx');
  expect(preview).not.toMatch(/contentFit="cover"/);
  expect([...preview.matchAll(/contentFit="contain"/g)].length).toBeGreaterThanOrEqual(2);

  const review = code('ReviewScreen.tsx');
  expect(review).toMatch(/aspect-\[3\/4\]/);
});

test('a video can actually be played back', () => {
  /*
   * It looped silently, which confirms something was captured but is not a
   * review of sixty seconds of footage. Somebody deciding whether to send needs
   * to scrub through it.
   */
  expect(code('CapturePreview.tsx')).toMatch(/nativeControls/);
});

test('a clip is filed with the time it was actually held for', () => {
  /*
   * `recordAsync` is awaited across the entire recording, so the closure that
   * resolves it is the one built before filming began — when the elapsed
   * counter was still 0. Reading the counter there filed every clip as
   * `durationMs: 0`. The SDK offers nothing better: `recordAsync` resolves to
   * `uri` and, on iOS, `codec`. Duration is the app's to measure.
   */
  const stage = code('CameraStage.tsx');
  const start = stage.slice(stage.indexOf('const handleVideoStart'));
  expect(start).toMatch(/durationMs: Math\.max\(0, Date\.now\(\) - startedAtRef\.current\)/);
  expect(start).not.toMatch(/durationMs: elapsedS/);
});

describe('the shutter is tapped, not held', () => {
  /*
   * Hold-to-record is wrong for what this app is for. A reporter filming an
   * incident needs both hands, or needs the phone steady at arm's length, or is
   * filming something they should not be seen filming — and a hold means a
   * thumb pinned to the glass for the whole shot, where any slip ends it early.
   * It also caps a clip at how long somebody can hold still, on a control whose
   * entire purpose is a sixty-second maximum.
   */
  test('one press starts it and the next one stops it', () => {
    const stage = code('CameraStage.tsx');
    expect(stage).toMatch(
      /onPress=\{\s*mode === 'photo' \? handlePhoto : recording \? handleVideoStop : handleVideoStart\s*\}/,
    );
  });

  test('the hold gesture is gone rather than kept alongside', () => {
    /*
     * Both on one control means a press has to decide whether it was a tap or a
     * hold, and that ambiguity produced both recording bugs this file already
     * covers: an end that beat a re-render, and a hold the long-press timer
     * never registered.
     */
    const stage = code('CameraStage.tsx');
    expect(stage).not.toMatch(/onLongPress=/);
    expect(stage).not.toMatch(/onPressOut=/);
    expect(stage).not.toMatch(/delayLongPress/);
  });

  test('stopping still decides off the ref, not off render state', () => {
    // The second tap can land before React has re-rendered from the first.
    const stop = code('CameraStage.tsx').slice(
      code('CameraStage.tsx').indexOf('const handleVideoStop'),
    );
    expect(stop).toMatch(/!recordingRef\.current/);
    expect(stop).not.toMatch(/if \(!recording\)/);
  });

  test('a recording is stopped exactly once', () => {
    /*
     * Reported as "I hit stop, it stopped, but it seems to have encountered an
     * error" — and it is the hazard tap-to-record introduced.
     *
     * `recordingRef` stays true until `recordAsync` settles, which is some way
     * after the stop is asked for. In that gap every other route to a stop is
     * still open: an impatient second tap, the sixty-second cap coming due, the
     * delayed stop that waits out the minimum duration. Under hold-to-record a
     * second release was physically impossible without another press; under
     * tap-to-record it is one twitchy finger, and `stopRecording` against a
     * camera that has already stopped throws on iOS.
     */
    const stage = code('CameraStage.tsx');
    expect(stage).toMatch(/const stoppingRef = useRef\(false\)/);
    // Every route goes through the one guarded function.
    expect(stage).toMatch(
      /if \(!recordingRef\.current \|\| stoppingRef\.current\) return;\s*\n\s*stoppingRef\.current = true;/,
    );
    expect([...stage.matchAll(/cameraRef\.current\?\.stopRecording\(\)/g)]).toHaveLength(1);
  });

  test('the native stop cannot crash the screen', () => {
    // We are inferring session state; the camera is the authority. A throw here
    // would replace a recording that very likely succeeded with a crash.
    const stage = code('CameraStage.tsx');
    expect(stage).toMatch(/try \{\s*\n\s*cameraRef\.current\?\.stopRecording\(\);\s*\n\s*\} catch/);
  });

  test('a failed recording says so instead of vanishing', () => {
    /*
     * There was no `catch` on the recording path at all. `recordAsync` is
     * awaited across the whole recording, so anything it rejected with became
     * an unhandled promise rejection: no message, and on a release build
     * nothing at all. Somebody who had just filmed an incident was left with a
     * camera that had plainly done something and would not say what.
     */
    const start = code('CameraStage.tsx').slice(
      code('CameraStage.tsx').indexOf('const handleVideoStart'),
    );
    expect(start).toMatch(/\} catch \(cause\) \{/);
    expect(start).toMatch(/toast\.error\(/);
    // The platform's own sentence, where there is one. This is a native failure
    // we cannot enumerate, and a tidy message that names nothing is worth less
    // to somebody in the field than the reason.
    expect(start).toMatch(/cause instanceof Error && cause\.message\.trim\(\)/);
  });

  test('a delayed stop cannot fire after the screen is gone', () => {
    // A reporter can leave mid-recording: a back gesture, a call, the app
    // backgrounded. The pending stop would fire against a dead camera.
    const stage = code('CameraStage.tsx');
    expect(stage).toMatch(/pendingStopRef\.current = setTimeout\(ask,/);
    expect(stage).toMatch(/if \(pendingStopRef\.current\) clearTimeout\(pendingStopRef\.current\)/);
  });

  test('the gap between stopping and saving is visible', () => {
    /*
     * `recordAsync` settles after the stop, and until it does the shutter shows
     * a stop button that now ignores every tap. A control that silently does
     * nothing reads as a broken app — which is how a working save gets reported
     * as a failure.
     */
    const stage = code('CameraStage.tsx');
    expect(stage).toMatch(/disabled=\{busy \|\| stopping\}/);
    expect(stage).toMatch(/capture\.savingRecording/);
  });

  test('the control says which tap it is waiting for', () => {
    /*
     * "Hold to record" under a button that no longer responds to a hold is
     * worse than no label. The caption now stays up during the recording,
     * because "tap to stop" is the instruction somebody actually needs then.
     */
    const stage = code('CameraStage.tsx');
    expect(stage).toMatch(/capture\.tapToRecord/);
    expect(stage).toMatch(/capture\.stopRecording/);
    expect(stage).not.toMatch(/holdToRecord/);
  });
});

test('footage the player cannot open says so', () => {
  /*
   * `VideoView` has no `onError`. `failed` was only ever set by the photo
   * branch, so an unreadable clip could never reach the failure state — it
   * rendered as a black rectangle, identical to a player still loading. The
   * documented route is the player's `statusChange` event.
   */
  const preview = code('CapturePreview.tsx');
  expect(preview).toMatch(/useEvent\(player, 'statusChange'/);
  expect(preview).toMatch(/status === 'error'/);
  expect(preview).toMatch(/\|\| playbackError/);
});

test('the caption does not swallow the player controls', () => {
  /*
   * It sits at the bottom of the frame, exactly where a player puts its
   * scrubber, and would otherwise take every tap meant for it.
   */
  expect(code('ReviewScreen.tsx')).toMatch(/pointerEvents="none"/);
});
