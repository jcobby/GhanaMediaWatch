import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { ReportOutcome } from '@/types/outcome';

/**
 * What institutions have done about one of the reporter's own reports.
 *
 * Fetched per report rather than with the list, because most reports are never
 * opened: loading a timeline for every row would be a request each for
 * something the reader will not look at.
 *
 * The card's one-line summary is the exception — it needs an answer before the
 * tap — so the list screen prefetches nothing and simply shows the summary once
 * the query lands. A row with no data yet reads as "not opened", which is also
 * the truthful answer while it is loading.
 */
export function useReportOutcome(incidentId: string | null) {
  return useQuery<ReportOutcome>({
    queryKey: ['reportOutcome', incidentId],
    queryFn: () => api.getReportResponses(incidentId!),
    enabled: Boolean(incidentId),
    // Institutions act over hours and days, not seconds.
    staleTime: 60_000,
  });
}
