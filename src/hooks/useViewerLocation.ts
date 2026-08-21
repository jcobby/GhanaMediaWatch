import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export interface ViewerLocation {
  latitude: number;
  longitude: number;
}

/** Central Accra. Used only when a real fix is unavailable, and flagged as such. */
const FALLBACK: ViewerLocation = { latitude: 5.6037, longitude: -0.187 };

interface UseViewerLocationResult {
  location: ViewerLocation;
  /** False when the coordinate is the fallback rather than a real device fix. */
  isReal: boolean;
  permissionDenied: boolean;
}

/**
 * The viewer's own position, for route drawing and distance.
 *
 * Distinct from the capture flow's GPS gate: that one demands 20 m accuracy
 * before it will let you film. This one only needs to be good enough to draw a
 * line on a map, so it asks for balanced accuracy and degrades to a city-centre
 * fallback rather than blocking the screen.
 *
 * `isReal` is surfaced so the UI can say the position is approximate instead of
 * quietly drawing a route from a coordinate the user never actually occupied.
 */
export function useViewerLocation(): UseViewerLocationResult {
  const [location, setLocation] = useState<ViewerLocation>(FALLBACK);
  const [isReal, setIsReal] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setPermissionDenied(true);
          return;
        }
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setLocation({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
        setIsReal(true);
      } catch {
        // A failed fix is not an error state here — the fallback still renders
        // a usable map, and `isReal` tells the UI to caveat the distance.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { location, isReal, permissionDenied };
}
