import { Linking, Platform } from 'react-native';

/**
 * Opening turn-by-turn directions to an incident.
 *
 * **Apple Maps is never used, and that is deliberate.** It has no driving
 * directions in Ghana — tapping through to it returns "Directions are not
 * available from this location", which reads as the app being broken rather
 * than the map provider lacking coverage. Google Maps has full routing here, so
 * every path leads there.
 *
 * The order is: the Google Maps app if it is installed, then Google Maps in a
 * browser. The browser fallback always works, which is why there is no failure
 * case beyond the device having no browser at all.
 *
 * Building turn-by-turn inside the app was the alternative. It needs a
 * directions provider, costs a paid API call per request, and would be worse
 * than the mapping app the reporter already has open every day.
 */
export interface Destination {
  latitude: number;
  longitude: number;
  /** Shown as the destination name where the provider supports it. */
  label?: string | null;
}

export type NavigationOutcome = 'app' | 'browser' | 'failed';

/** Google Maps in a browser. Works everywhere, including desktop. */
function webUrl(destination: Destination): string {
  const { latitude, longitude } = destination;
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
}

/**
 * The installed Google Maps app.
 *
 * Android's `google.navigation:` starts guidance immediately rather than
 * showing a preview, which is what someone driving toward an incident wants.
 * iOS has no equivalent, so it gets the `comgooglemaps:` scheme — which
 * requires `comgooglemaps` in LSApplicationQueriesSchemes or `canOpenURL`
 * silently returns false.
 */
function appUrl(destination: Destination): string {
  const { latitude, longitude } = destination;
  return Platform.OS === 'ios'
    ? `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`
    : `google.navigation:q=${latitude},${longitude}`;
}

export async function openDirections(destination: Destination): Promise<NavigationOutcome> {
  const { latitude, longitude } = destination;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'failed';

  try {
    const app = appUrl(destination);
    if (await Linking.canOpenURL(app)) {
      await Linking.openURL(app);
      return 'app';
    }
  } catch {
    // Fall through. A refused scheme check is not a reason to give up — the
    // browser route below does not depend on it.
  }

  try {
    await Linking.openURL(webUrl(destination));
    return 'browser';
  } catch {
    return 'failed';
  }
}
