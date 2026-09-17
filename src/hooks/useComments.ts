import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { IncidentComment } from '@/types/comments';
import { queryKeys } from './useIncidents';

export const commentKeys = {
  forIncident: (incidentId: string) => ['comments', incidentId] as const,
};

/**
 * The discussion under a report, from the server.
 *
 * It used to come from a store on the phone seeded with fixtures, so a comment
 * was only ever seen by the person who wrote it, on the phone they wrote it on.
 */
export function useComments(incidentId: string) {
  return useQuery({
    queryKey: commentKeys.forIncident(incidentId),
    queryFn: () => api.getComments(incidentId),
    enabled: Boolean(incidentId),
    staleTime: 15_000,
  });
}

/**
 * Post a comment, and show it at once.
 *
 * Appended to the cached list as soon as the service accepts it, then refetched
 * so the server's own copy — its id, its time, its author name — replaces the
 * optimistic one. The report is refetched too, because its comment count moved.
 */
export function usePostComment(incidentId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (draft: { body: string; isAnonymous: boolean }) =>
      api.postComment(incidentId, draft.body, draft.isAnonymous),
    onSuccess: (comment) => {
      client.setQueryData<IncidentComment[]>(commentKeys.forIncident(incidentId), (previous) => [
        ...(previous ?? []),
        comment,
      ]);
      void client.invalidateQueries({ queryKey: commentKeys.forIncident(incidentId) });
      void client.invalidateQueries({ queryKey: queryKeys.incident(incidentId) });
    },
  });
}
