import { useCallback } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from '@/api';
import type { FeedQuery, Incident, IncidentCategory, Page } from '@/types/api';
import type { MapData } from '@/api/client';

/**
 * Query keys, centralised.
 *
 * Kept in one place so an invalidation after a submission cannot miss a cache
 * entry because two files spelled the key differently.
 */
export const queryKeys = {
  feed: (query: FeedQuery) => ['feed', query] as const,
  incident: (id: string) => ['incident', id] as const,
  map: (categories: IncidentCategory[]) => ['map', categories] as const,
  myIncidents: () => ['me', 'incidents'] as const,
  orgDashboard: () => ['org', 'dashboard'] as const,
};

export function useFeed(query: FeedQuery = {}): UseQueryResult<Page<Incident>> {
  return useQuery({
    queryKey: queryKeys.feed(query),
    queryFn: () => api.getFeed(query),
    // The feed is the app's front door; a stale-but-instant render beats a
    // spinner, and it refreshes underneath.
    staleTime: 30_000,
  });
}

export function useIncident(id: string): UseQueryResult<Incident> {
  return useQuery({
    queryKey: queryKeys.incident(id),
    queryFn: () => api.getIncident(id),
    enabled: Boolean(id),
  });
}

export function useMapData(categories: IncidentCategory[] = []): UseQueryResult<MapData> {
  return useQuery({
    queryKey: queryKeys.map(categories),
    queryFn: () => api.getMapData(categories.length ? { category: categories } : {}),
    staleTime: 60_000,
  });
}

export function useMyIncidents() {
  return useQuery({
    queryKey: queryKeys.myIncidents(),
    queryFn: () => api.getMyIncidents(),
  });
}

/**
 * Reacting to a report.
 *
 * Written straight into the cache rather than sent anywhere. There is no
 * reactions endpoint yet, and a heart that animates but forgets on the next
 * refresh would be worse than one that does nothing — this at least keeps the
 * count and the filled state consistent with what the person just tapped, for
 * as long as the cache lives.
 *
 * Every cached feed page is updated, not just the one on screen: the same
 * report appears in the unfiltered feed and under whatever category filter is
 * active, and updating one would leave the other contradicting it.
 *
 * Kept as a plain function taking the client so the rule can be tested without
 * rendering anything; the hook below is only the binding.
 */
export function toggleReactionIn(client: QueryClient, incident: Incident): void {
  const next = !incident.viewerHasReacted;
  const delta = next ? 1 : -1;

  const apply = (target: Incident): Incident =>
    target.id === incident.id
      ? {
          ...target,
          viewerHasReacted: next,
          counts: {
            ...target.counts,
            // Clamped: a stale cache could otherwise show -1 reactions.
            reactions: Math.max(0, target.counts.reactions + delta),
          },
        }
      : target;

  client.setQueriesData<Page<Incident>>({ queryKey: ['feed'] }, (page) =>
    page ? { ...page, items: page.items.map(apply) } : page,
  );
  client.setQueryData<Incident>(queryKeys.incident(incident.id), (current) =>
    current ? apply(current) : current,
  );
}

export function useToggleReaction(): (incident: Incident) => void {
  const client = useQueryClient();
  return useCallback((incident: Incident) => toggleReactionIn(client, incident), [client]);
}
