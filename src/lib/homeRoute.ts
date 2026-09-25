import type { Profile } from '@/stores/authStore';

export type HomeRoute = '/(org)' | '/(tabs)' | '/onboarding/organisation';

/**
 * Where an account belongs when it opens the app.
 *
 * One function rather than the same ternary in the launch router, the sign-in
 * screen and the sign-up screen. Three copies of that decision is how an
 * operator comes to be routed correctly on launch and into the reporter app
 * after signing in — signed in, with none of their inbox, and nothing on screen
 * to explain it.
 *
 * Three destinations now, and the third is the one that is easy to get wrong.
 * An organisation whose application has not been approved may call
 * `/org/onboarding/*` and **nothing else** under `/org/*` — every other route
 * answers `403 check: "org_pending"`. Sending it to the inbox would be four
 * tabs of refusals on an account with nothing wrong with it, so it goes to the
 * application it still has to finish.
 *
 * A platform owner is deliberately sent to the reporter app. That work is done
 * in the web console and the phone has no screens for it; sending them to a
 * shell that does not exist would be a blank screen with no way back.
 */
export function homeRouteFor(profile: Profile | null): HomeRoute {
  if (profile?.accountType !== 'organisation') return '/(tabs)';
  return profile.orgVerified === false ? '/onboarding/organisation' : '/(org)';
}
