import { useQuery, type UseQueryResult } from '@tanstack/react-query';
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
