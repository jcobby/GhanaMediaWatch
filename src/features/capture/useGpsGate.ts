import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { GPS_WATCH_INTERVAL_MS } from '@/lib/constants';
import { hapticUnlock } from '@/lib/haptics';
import { evaluateGate, type GateStatus, type LocationFix } from './gpsGate';

interface UseGpsGateResult {
  status: GateStatus;
  fix: LocationFix | null;
  acceptReducedAccuracy: () => void;
  retryPermission: () => void;
}

/**
 * Watches the device's position and feeds it to the pure gate.
 *
 * This hook owns only the platform work — permissions, the subscription, and
 * the elapsed-time clock. Every decision about what a reading *means* lives in
 * `evaluateGate`, which is why the gate's behaviour is unit-tested without a
 * device.
 */
export function useGpsGate(active: boolean): UseGpsGateResult {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [servicesEnabled, setServicesEnabled] = useState(true);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reducedAccepted, setReducedAccepted] = useState(false);
  const [permissionAttempt, setPermissionAttempt] = useState(0);

  const startedAt = useRef<number>(Date.now());
  const wasUnlocked = useRef(false);

  // Permission and service availability.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    void (async () => {
      const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
      if (cancelled) return;
      setServicesEnabled(enabled);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermissionGranted(status === 'granted');
    })();

    return () => {
      cancelled = true;
    };
  }, [active, permissionAttempt]);

  // The position subscription.
  useEffect(() => {
    if (!active || !permissionGranted || !servicesEnabled) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    startedAt.current = Date.now();

    void (async () => {
      subscription = await Location.watchPositionAsync(
        {
          // BestForNavigation is the tightest the OS offers. It costs battery,
          // but the gate exists precisely to demand this accuracy.
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: GPS_WATCH_INTERVAL_MS,
          distanceInterval: 0,
        },
        (reading) => {
          if (cancelled) return;
          setFix({
            latitude: reading.coords.latitude,
            longitude: reading.coords.longitude,
            // A reading with no accuracy figure cannot be trusted to pass the
            // gate, so it is treated as maximally inaccurate rather than zero.
            accuracyM: reading.coords.accuracy ?? Number.POSITIVE_INFINITY,
            altitude: reading.coords.altitude,
            heading: reading.coords.heading,
            speed: reading.coords.speed,
            isMocked: Boolean((reading as { mocked?: boolean }).mocked),
            timestamp: reading.timestamp,
          });
        },
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, permissionGranted, servicesEnabled]);

  // Elapsed-time clock, which drives the stall timeout.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 1_000);
    return () => clearInterval(id);
  }, [active]);

  const status = evaluateGate({
    permissionGranted,
    servicesEnabled,
    fix,
    elapsedMs,
    reducedAccuracyAccepted: reducedAccepted,
  });

  // Confirm the unlock physically — the reporter is usually looking at the
  // scene, not the screen, at the moment the camera becomes available.
  useEffect(() => {
    const unlocked = status.kind === 'ready';
    if (unlocked && !wasUnlocked.current) hapticUnlock();
    wasUnlocked.current = unlocked;
  }, [status.kind]);

  const acceptReducedAccuracy = useCallback(() => setReducedAccepted(true), []);
  const retryPermission = useCallback(() => setPermissionAttempt((n) => n + 1), []);

  return { status, fix, acceptReducedAccuracy, retryPermission };
}
