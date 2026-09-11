import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api';
import type { DirectoryOrganisation } from '@/types/dawuro';

/**
 * The organisations a reporter can send a report to.
 *
 * From the server, never from a fixture. Every screen that asks somebody to
 * choose a recipient used a seeded list — so a reporter picked two agencies,
 * pressed send, and the report went to organisations that do not exist on the
 * platform. That is not a cosmetic placeholder: it takes a real decision about
 * where their footage goes and quietly discards it.
 *
 * The directory changes rarely, so a stale-but-instant list is right: the
 * picker opens on what was there a minute ago and refreshes underneath.
 */
export function useOrganisations(): UseQueryResult<DirectoryOrganisation[]> {
  return useQuery({
    queryKey: ['organisations'],
    queryFn: () => api.getOrganisations(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Only organisations that can currently receive a report.
 *
 * **On `verified`, not on billing state.** This filtered on
 * `subscriptionStatus === 'active' || 'trialing'` — a field the public
 * directory does not send. Every organisation therefore failed the test, the
 * list was always empty, and the capture screen told every reporter "No buyers
 * yet" and "no organisation has joined the platform". Measured against the live
 * service with two verified, active newsrooms in the directory: still nobody.
 *
 * That is the worst shape a bug can take here. It did not error, it did not
 * look broken, and it quietly removed the reason anyone would send a report to
 * a newsroom rather than to the feed.
 *
 * `verified` is what the endpoint actually carries and is the platform's own
 * statement that an organisation is real and approved. Whether their
 * subscription is paid is genuinely none of a reporter's organisation, and the
 * server does not offer it here — filtering on what we are given beats
 * filtering on what we wish we had.
 */
export function receiving(
  organisations: DirectoryOrganisation[] | undefined,
): DirectoryOrganisation[] {
  return (organisations ?? []).filter((o) => o.verified);
}
