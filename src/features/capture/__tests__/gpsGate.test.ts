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
