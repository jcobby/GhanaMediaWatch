import { OrgOnboardingScreen } from '@/features/org/OrgOnboardingScreen';

/**
 * The application an organisation works through before it is approved.
 *
 * Its own route rather than a tab: a pending organisation may call
 * `/org/onboarding/*` and nothing else, so an inbox behind this would be four
 * screens of refusals on an account with nothing wrong with it.
 */
export default function OrganisationOnboardingRoute() {
  return <OrgOnboardingScreen />;
}
