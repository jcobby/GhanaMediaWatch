import fs from 'fs';
import path from 'path';
import {
  acquisitionProgress,
  canOfferReducedAccuracy,
  evaluateGate,
  isCameraUnlocked,
  lockFix,
  type GateInput,
  type LocationFix,
} from '../gpsGate';
import {
  GPS_ABSOLUTE_MAX_ACCURACY_M,
  GPS_ACCURACY_THRESHOLD_M,
  GPS_STALL_TIMEOUT_MS,
} from '@/lib/constants';

function fixAt(accuracyM: number, overrides: Partial<LocationFix> = {}): LocationFix {
  return {
    latitude: 5.603717,
    longitude: -0.186964,
    accuracyM,
    altitude: 61,
    heading: null,
    speed: 0,
    isMocked: false,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

function input(overrides: Partial<GateInput> = {}): GateInput {
  return {
    permissionGranted: true,
    servicesEnabled: true,
    fix: null,
    elapsedMs: 0,
    reducedAccuracyAccepted: false,
    ...overrides,
  };
}

describe('the gate blocks the camera', () => {
  it('when permission was refused', () => {
    const status = evaluateGate(input({ permissionGranted: false, fix: fixAt(5) }));
    expect(status.kind).toBe('permission_denied');
    // Even a perfect fix must not unlock the camera without permission.
    expect(isCameraUnlocked(status)).toBe(false);
  });

  it('when location services are off device-wide', () => {
    const status = evaluateGate(input({ servicesEnabled: false, fix: fixAt(5) }));
    expect(status.kind).toBe('services_disabled');
  });

  it('checks permission before accuracy', () => {
    // Telling someone to "move to an open area" when they never granted
    // permission sends them outside to stare at a phone that cannot work.
    const status = evaluateGate(
      input({ permissionGranted: false, elapsedMs: GPS_STALL_TIMEOUT_MS * 2 }),
    );
    expect(status.kind).toBe('permission_denied');
  });

  it('while no fix has arrived at all', () => {
    const status = evaluateGate(input({ fix: null }));
    expect(status).toEqual({ kind: 'acquiring', accuracyM: null, elapsedMs: 0 });
  });

  it('while the fix is looser than the threshold', () => {
    const status = evaluateGate(input({ fix: fixAt(GPS_ACCURACY_THRESHOLD_M + 0.1) }));
    expect(status.kind).toBe('acquiring');
    expect(isCameraUnlocked(status)).toBe(false);
  });
});

describe('the gate opens', () => {
  it('exactly at the threshold, not one metre later', () => {
    const status = evaluateGate(input({ fix: fixAt(GPS_ACCURACY_THRESHOLD_M) }));
    expect(status.kind).toBe('ready');
    expect(isCameraUnlocked(status)).toBe(true);
  });

  it('with high confidence for a tight fix', () => {
    const status = evaluateGate(input({ fix: fixAt(6) }));
    expect(status).toMatchObject({ kind: 'ready', confidence: 'high' });
  });
});

describe('the reduced-accuracy escape hatch', () => {
  it('is not offered until the gate has stalled', () => {
    const early = evaluateGate(input({ fix: fixAt(60), elapsedMs: 1_000 }));
    expect(canOfferReducedAccuracy(early, fixAt(60))).toBe(false);
  });

  it('is offered once stalled with a usable-if-imprecise fix', () => {
    const stalled = evaluateGate(input({ fix: fixAt(60), elapsedMs: GPS_STALL_TIMEOUT_MS }));
    expect(stalled.kind).toBe('stalled');
    expect(canOfferReducedAccuracy(stalled, fixAt(60))).toBe(true);
  });

  it('is NOT offered when there is no fix to proceed with', () => {
    // Proceeding with nothing produces a report with no coordinate, which is
    // precisely what the gate exists to prevent.
    const stalled = evaluateGate(input({ fix: null, elapsedMs: GPS_STALL_TIMEOUT_MS }));
    expect(canOfferReducedAccuracy(stalled, null)).toBe(false);
  });

  it('flags the report as low confidence rather than hiding the downgrade', () => {
    const status = evaluateGate(
      input({ fix: fixAt(60), elapsedMs: GPS_STALL_TIMEOUT_MS, reducedAccuracyAccepted: true }),
    );
    expect(status).toMatchObject({ kind: 'ready', confidence: 'low' });
  });

  it('refuses a fix beyond the absolute maximum even when accepted', () => {
    // Past this point the coordinate is not a location; it would put a
    // meaningless pin on a dispatcher's map.
    const status = evaluateGate(
      input({
        fix: fixAt(GPS_ABSOLUTE_MAX_ACCURACY_M + 1),
        elapsedMs: GPS_STALL_TIMEOUT_MS,
        reducedAccuracyAccepted: true,
      }),
    );
    expect(status.kind).toBe('stalled');
    expect(isCameraUnlocked(status)).toBe(false);
  });
});

describe('mock locations', () => {
  it('still unlock the camera but carry the flag through', () => {
    // The product accepts them and flags them; silently blocking would leave
    // the reporter with no idea why the camera never opened.
    const status = evaluateGate(input({ fix: fixAt(8, { isMocked: true }) }));
    expect(status).toMatchObject({ kind: 'ready' });
    if (status.kind === 'ready') expect(status.fix.isMocked).toBe(true);
  });
});

describe('acquisition progress', () => {
  it('is zero with no reading and one at the threshold', () => {
    expect(acquisitionProgress(null)).toBe(0);
    expect(acquisitionProgress(GPS_ACCURACY_THRESHOLD_M)).toBe(1);
    expect(acquisitionProgress(2)).toBe(1);
  });

  it('never goes negative for a wildly inaccurate reading', () => {
    expect(acquisitionProgress(GPS_ABSOLUTE_MAX_ACCURACY_M * 10)).toBe(0);
  });

  it('rises monotonically as the fix tightens', () => {
    const readings = [140, 100, 70, 40, 25, 20];
    const progress = readings.map(acquisitionProgress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });
});

describe('locking the fix', () => {
  it('stamps the capture moment onto the coordinate', () => {
    const at = new Date('2026-08-19T11:21:04.000Z');
    const locked = lockFix(fixAt(7), at);
    expect(locked.capturedAtIso).toBe('2026-08-19T11:21:04.000Z');
    expect(locked.accuracyM).toBe(7);
  });

  it('records the offset as minutes ahead of UTC', () => {
    // getTimezoneOffset returns minutes *behind* UTC, so the sign must flip or
    // every report from Accra lands an hour out.
    const at = new Date('2026-08-19T11:21:04.000Z');
    const locked = lockFix(fixAt(7), at);
    expect(locked.capturedAtUtcOffsetMinutes).toBe(-at.getTimezoneOffset());
  });
});

describe('the gate is a door, not a turnstile', () => {
  /*
   * Reported as `CameraUnmountedException: Camera unmounted during taking photo
   * process` on a recording that had been running fine, with the GPS screen
   * behind the message reading ±72 m against a ±20 m threshold.
   *
   * The capture screen mounted the camera only while the *current* reading
   * passed, and the gate re-evaluates on every reading. GPS accuracy is not
   * stable — indoors it swings from ±9 m to ±70 m and back in the same room — so
   * one poor reading unmounted the camera and killed the recording in flight. A
   * reporter filming something they may not get a second chance at lost the
   * footage to a satellite.
   *
   * Nothing was gained by it either: the coordinate is locked at the shutter, so
   * the report's fix was already decided when recording began. Re-closing the
   * gate cannot improve what gets filed — only destroy it.
   */
  const SRC = path.resolve(__dirname, '..');
  const read = (name: string) => fs.readFileSync(path.join(SRC, name), 'utf8');
  const code = (name: string) =>
    read(name)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  test('a reading that cleared the threshold is remembered', () => {
    const hook = code('useGpsGate.ts');
    expect(hook).toMatch(
      /if \(next\.accuracyM <= GPS_ACCURACY_THRESHOLD_M\) setLastPassingFix\(next\)/,
    );
  });

  test('it is remembered from the subscription, not from an effect', () => {
    /*
     * Setting state as an effect fires a second render pass before paint, which
     * the React Compiler rejects as a cascading render. The position callback is
     * an event and the natural home for it.
     */
    const hook = code('useGpsGate.ts');
    const callback = hook.slice(
      hook.indexOf('(reading) =>'),
      hook.indexOf('return {', hook.indexOf('(reading) =>')),
    );
    expect(callback).toMatch(/setLastPassingFix/);
    expect(hook).not.toMatch(/useEffect\([^)]*setLastPassingFix/s);
  });

  test('the freshest passing reading wins', () => {
    // Waiting for a better fix has to actually improve the one the shutter
    // locks, or the gate is teaching reporters that waiting is pointless.
    expect(code('useGpsGate.ts')).toMatch(/setFix\(next\);/);
  });

  test('the camera stays open across a wobble', () => {
    const screen = code('CaptureScreen.tsx');
    expect(screen).toMatch(
      /lastPassingFix\s*\?\s*\{ fix: lastPassingFix, confidence: 'high' as const \}/,
    );
  });

  test('permission and services still close it', () => {
    /*
     * Those are states where continuing is genuinely wrong rather than merely
     * noisy, and neither can happen without the reporter leaving the app to
     * change a setting — so neither takes a recording by surprise.
     */
    const screen = code('CaptureScreen.tsx');
    const permission = screen.indexOf("status.kind === 'permission_denied'");
    const services = screen.indexOf("status.kind === 'services_disabled'");
    const camera = screen.indexOf('if (open)');
    expect(permission).toBeGreaterThan(-1);
    expect(permission).toBeLessThan(camera);
    expect(services).toBeLessThan(camera);
  });

  test('only the strict threshold latches', () => {
    /*
     * The reduced-accuracy hatch is already sticky, because accepting it is —
     * `reducedAccuracyAccepted` is state the reporter set. Latching those too
     * would hold a 150 m fix open on a screen whose whole purpose is a
     * coordinate somebody can be dispatched to.
     */
    expect(code('useGpsGate.ts')).not.toMatch(/GPS_ABSOLUTE_MAX_ACCURACY_M/);
  });
});
