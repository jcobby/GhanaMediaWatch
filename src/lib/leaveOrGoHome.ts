import { router } from 'expo-router';

/**
 * Go back, or go somewhere sensible when there is nowhere to go back to.
 *
 * **`router.back()` is a no-op on an empty stack, and a back button that does
 * nothing is indistinguishable from a broken screen.** The introduction ends
 * with `router.replace`, so choosing "Create an account" from it leaves a stack
 * one entry deep: the intro is gone, sign-up is the root, and the chevron in
 * its corner did nothing at all. Every other route into that screen — the
 * welcome screen, the sign-in screen, the review screen — pushes, so back
 * worked from all of them and the one path a first-time user takes was the one
 * that failed.
 *
 * The fallback is the feed rather than the introduction. Onboarding is already
 * marked complete by the time sign-up opens, and "continue without an account"
 * was one of the three endings offered a moment earlier — so backing out of
 * creating an account lands exactly where declining to create one would have.
 */
export function leaveOrGoHome(fallback: '/(tabs)' = '/(tabs)') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
