import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api';
import type { Survey } from '@/types/dawuro';

/**
 * Paid questions a reporter can answer.
 *
 * From the server. The surveys list was a fixture, so somebody could open a
 * survey, answer five questions and submit — against a survey that no
 * organisation had commissioned and for a reward nobody was going to pay. That
 * is the same promise the earnings screen makes, broken at the other end.
 */
/**
 * One organisation's surveys, for its homepage. Public, so a reader without an
 * account sees them too. Idle until an organisation is chosen.
 */
export function useOrganisationSurveys(organisationId: string | null): UseQueryResult<Survey[]> {
  return useQuery({
    queryKey: ['organisationSurveys', organisationId],
    queryFn: () => api.getOrganisationSurveys(organisationId!),
    enabled: Boolean(organisationId),
    staleTime: 60_000,
  });
}

export function useSurveys(): UseQueryResult<Survey[]> {
  return useQuery({
    queryKey: ['surveys'],
    queryFn: () => api.getSurveys(),
    staleTime: 60_000,
  });
}
