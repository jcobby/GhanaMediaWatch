import { useRouter } from 'expo-router';
import { SearchOverlay } from './SearchOverlay';
import type { Incident } from '@/types/api';

/**
 * Search, as a place rather than a panel.
 *
 * It was reachable only from a magnifier in the masthead, which is one tap on
 * one screen: a reader who had scrolled into a report, or who was anywhere but
 * the feed, had to go back to find it. Search is one of the two things people
 * open a news app to do — read what is new, or find a particular thing — and
 * only the first of those had a tab.
 *
 * The same `SearchOverlay` either way, because there is no second search to
 * maintain. What changes is what closing means: dismissing a panel returns you
 * to what was underneath, while leaving a tab has to go somewhere, and the feed
 * is the only sensible somewhere.
 *
 * Unscoped by design. The overlay narrows to one organisation's reports when it
 * is opened from that organisation's homepage; a tab belongs to nobody, so it
 * searches everything and fetches its own wider page.
 */
export function SearchScreen() {
  const router = useRouter();

  return (
    <SearchOverlay
      /*
       * A screen, not a modal — and this was the bug that made every result
       * row look dead. The overlay wrapped itself in a `<Modal>`, which renders
       * above the navigator, so the report that `onOpenIncident` pushed opened
       * behind it and was never seen.
       */
      presentation="screen"
      organisationIncidents={null}
      onOpenIncident={(incident: Incident) => router.push(`/incident/${incident.id}`)}
      /*
       * A tab has no "underneath" to return to, so closing goes home rather
       * than popping — `router.back()` on the first screen of a tab is the
       * silent no-op that made the sign-up chevron look broken.
       */
      onClose={() => router.replace('/(tabs)')}
    />
  );
}
