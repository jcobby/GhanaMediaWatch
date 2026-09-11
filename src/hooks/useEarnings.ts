import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { CommissionEntry, EarningsSummary } from '@/types/dawuro';

/**
 * What the reporter has earned.
 *
 * Read from the server rather than from a constant. The Earn screen used to
 * open on GH₵84.50 for everybody, including an account created a minute
 * earlier — a number about money that was not the reader's, which is the worst
 * kind of placeholder to leave in.
 */
export function useEarnings() {
  return useQuery<EarningsSummary>({
    queryKey: ['earnings'],
    queryFn: () => api.getEarnings(),
    // Money moves when an organisation licenses something, not second by second.
    staleTime: 60_000,
  });
}

export function useCommissions() {
  return useQuery<CommissionEntry[]>({
    queryKey: ['commissions'],
    queryFn: () => api.getCommissions(),
    staleTime: 60_000,
  });
}
