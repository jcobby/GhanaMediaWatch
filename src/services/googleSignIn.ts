/**
 * Signing in with a Google account.
 *
 * `@react-native-google-signin/google-signin` rather than
 * `expo-auth-session/providers/google`: the AuthSession Google provider is
 * deprecated in SDK 57 and its own documentation points here.
 *
 * **Nothing is imported until somebody taps the button.** The library resolves
 * its native module at *import* time — `TurboModuleRegistry.getEnforcing`, which
 * throws rather than returning null — so a plain top-level import crashes the
 * app at launch anywhere the native side is missing: Expo Go, and every jest
 * run. That is not hypothetical here; it took the auth store's whole test suite
 * down the moment the import was added, and the app boots through that same
 * store.
 *
 * So the module is pulled in by a dynamic import inside the two functions that
 * need it. Launch never touches it, the tests never touch it, and a build
 * without the native module fails at the tap — where there is a person to tell.
 *
 * **The client IDs are configuration, not code.** They are created per app in
 * the Google Cloud console and cannot be committed or guessed, so they are read
 * from the environment and `isGoogleConfigured` is false until they are set.
 * Everything that offers the button checks that first: a "Continue with Google"
 * that opens a picker and then fails on an empty audience is worse than no
 * button, because the person cannot tell it from their account being refused.
 */

/**
 * The web client id — what the *backend* verifies the token against.
 *
 * Required on both platforms even though neither is the web: it is the audience
 * the id token is issued for, and the service checks that audience. Android
 * additionally needs its own OAuth client registered with the app's signing
 * certificate, but that one is never named here — Google matches it by
 * signature.
 */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

export const isGoogleConfigured = WEB_CLIENT_ID.length > 0;

/** What the caller needs to exchange with the service. */
export interface GoogleIdentity {
  idToken: string;
  email: string;
  displayName: string;
}

/**
 * Thrown for the failures a person can do something about. Anything else is
 * re-thrown as-is so it reaches the error copy with its own words.
 */
export class GoogleSignInUnavailable extends Error {
  constructor(readonly reason: 'not_configured' | 'unavailable' | 'play_services' | 'no_token') {
    super(reason);
    this.name = 'GoogleSignInUnavailable';
  }
}

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let loaded: GoogleModule | null = null;
let configured = false;

/**
 * The library, and its configuration, on first use.
 *
 * A failed import means the native module is not in this binary — Expo Go, or a
 * development build made before the package was added. It is named rather than
 * left as an opaque native error, because the fix is "rebuild", which nobody
 * guesses from a TurboModule invariant.
 */
async function load(): Promise<GoogleModule> {
  if (!loaded) {
    try {
      loaded = await import('@react-native-google-signin/google-signin');
    } catch {
      throw new GoogleSignInUnavailable('unavailable');
    }
  }

  if (!configured) {
    loaded.GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
      // The two the service needs and nothing more. Scopes are a consent screen
      // somebody reads, and asking for more than a name and an address makes
      // the app look like it wants their contacts.
      scopes: ['email', 'profile'],
    });
    configured = true;
  }

  return loaded;
}

/**
 * Open Google's picker and return the identity it issues.
 *
 * `null` means the person cancelled, which is not a failure and must not be
 * reported as one — a toast saying "sign-in failed" after somebody deliberately
 * dismissed the sheet is the app arguing with them.
 */
export async function signInWithGoogle(): Promise<GoogleIdentity | null> {
  if (!isGoogleConfigured) throw new GoogleSignInUnavailable('not_configured');

  const { GoogleSignin, isSuccessResponse } = await load();

  /*
   * Android only, and it can prompt. A device without current Play Services
   * cannot complete the flow at all, so this is checked before the picker
   * rather than surfacing as an opaque native error inside it.
   */
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch {
    throw new GoogleSignInUnavailable('play_services');
  }

  const response = await GoogleSignin.signIn();
  // Cancelled. The library models this as a response, not an exception.
  if (!isSuccessResponse(response)) return null;

  const { idToken, user } = response.data;
  /*
   * No token, no sign-in. The type allows null, and sending the email without
   * it would ask the service to trust an address nobody proved — precisely the
   * hole this flow exists to avoid.
   */
  if (!idToken) throw new GoogleSignInUnavailable('no_token');

  return {
    idToken,
    email: user.email,
    // Google has no name for some accounts; the service needs something to show
    // on a report, and the local part of the address is what this app already
    // falls back to elsewhere.
    displayName: user.name?.trim() || user.email.split('@')[0] || 'Reporter',
  };
}

/**
 * Forget the Google session too.
 *
 * Without this, signing out of Dawuro and tapping the button again silently
 * re-uses the last Google account rather than offering the picker — which on a
 * shared phone signs the next person into the previous person's account.
 *
 * Never loads the library just to sign out of it: if it was never configured,
 * there is no Google session to end.
 */
export async function forgetGoogleSession(): Promise<void> {
  if (!configured || !loaded) return;
  try {
    await loaded.GoogleSignin.signOut();
  } catch {
    // Nothing to revoke. Signing out of Dawuro must not depend on Google
    // answering.
  }
}
