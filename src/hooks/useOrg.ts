import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import type { Page } from '@/types/api';
import type {
  LicenceResult,
  OrgAssignment,
  OrgDashboard,
  OrgInboxItem,
  OrgIncidentStatus,
  OrgMember,
  OrgResponseAction,
  PublicationRequest,
} from '@/types/org';

/**
 * Everything the organisation experience reads and writes.
 *
 * Each query is keyed by the organisation id, not just by the resource. An
 * account can belong to more than one organisation, and a cache keyed on
 * `['org','inbox']` alone would hand the second one the first one's inbox —
 * which on this product means showing an agency reports it has not been routed
 * and has no right to see.
 *
 * Every query is disabled until an organisation is known, so nothing fires a
 * request the service would refuse for want of the scope header.
 */

export const orgKeys = {
  dashboard: (orgId: string) => ['org', orgId, 'dashboard'] as const,
  inbox: (orgId: string) => ['org', orgId, 'inbox'] as const,
  assignments: (orgId: string) => ['org', orgId, 'assignments'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
};

/** The organisation this phone is acting for, or null. */
export function useOrgId(): string | null {
  return useAuthStore((s) => (s.profile?.accountType === 'organisation' ? s.profile.orgId : null));
}

export function useOrgDashboard(): UseQueryResult<OrgDashboard> {
  const orgId = useOrgId();
  return useQuery({
    queryKey: orgKeys.dashboard(orgId ?? ''),
    queryFn: () => api.getOrgDashboard(orgId!),
    enabled: Boolean(orgId),
    staleTime: 30_000,
  });
}

export function useOrgInbox(): UseQueryResult<Page<OrgInboxItem>> {
  const orgId = useOrgId();
  return useQuery({
    queryKey: orgKeys.inbox(orgId ?? ''),
    queryFn: () => api.getOrgInbox(orgId!),
    enabled: Boolean(orgId),
    /*
     * Short, because this is a queue somebody is watching. A report routed
     * while the screen is open is the case the push notification exists for,
     * and a ten-minute stale window would have the officer reading a list that
     * disagrees with the alert on their lock screen.
     */
    staleTime: 15_000,
  });
}

/**
 * What this organisation has licensed, newest first.
 *
 * Derived from the inbox rather than fetched separately, because the service
 * has no endpoint that lists licences — `licensed` and `licensedAt` on each
 * inbox item are the whole record, and they are enough. Sorted on `licensedAt`
 * with a missing date last: an older service licensed reports without dating
 * them, and those must not sort to the top as though they were bought a moment
 * ago.
 */
export function useOrgLicences(): {
  licences: OrgInboxItem[];
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: () => void;
} {
  const query = useOrgInbox();
  const items = query.data?.items;

  const licences = useMemo(() => {
    const held = (items ?? []).filter((item) => item.licensed);
    return held.sort((a, b) => {
      if (!a.licensedAt && !b.licensedAt) return 0;
      if (!a.licensedAt) return 1;
      if (!b.licensedAt) return -1;
      return b.licensedAt.localeCompare(a.licensedAt);
    });
  }, [items]);

  return {
    licences,
    isPending: query.isPending,
    isError: query.isError,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

/**
 * One report, when the inbox page does not contain it.
 *
 * The detail screen reads from the shared inbox cache, which is the right
 * default — the officer arrived by tapping a row the phone is already holding,
 * and a second request would put a spinner over content that is on screen.
 *
 * But the inbox is one page of fifty. A report opened from a notification, from
 * a link, or simply after the queue has moved on is not in it, and the screen
 * used to answer that with "That report isn't here" — about a report the
 * organisation may well hold a licence on. `GET /org/incidents/{id}` is the
 * endpoint that can still answer, so it is asked, and only its 404 means gone.
 */
export function useOrgIncident(
  incidentId: string,
  enabled: boolean,
): UseQueryResult<OrgInboxItem> {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['org', orgId ?? '', 'incident', incidentId] as const,
    queryFn: () => api.getOrgIncident(orgId!, incidentId),
    enabled: Boolean(orgId) && Boolean(incidentId) && enabled,
  });
}

export function useOrgAssignments(): UseQueryResult<OrgAssignment[]> {
  const orgId = useOrgId();
  return useQuery({
    queryKey: orgKeys.assignments(orgId ?? ''),
    queryFn: () => api.getOrgAssignments(orgId!),
    enabled: Boolean(orgId),
    staleTime: 15_000,
  });
}

export function useOrgMembers(): UseQueryResult<OrgMember[]> {
  const orgId = useOrgId();
  return useQuery({
    queryKey: orgKeys.members(orgId ?? ''),
    queryFn: () => api.getOrgMembers(orgId!),
    enabled: Boolean(orgId),
    // People change far more slowly than reports do.
    staleTime: 5 * 60_000,
  });
}

/**
 * Licensing, which is a purchase.
 *
 * The inbox is invalidated rather than edited in place. The service decides
 * what a licence leaves behind — the licence date, the metering counters, the
 * commission it created — and writing a guess at that into the cache would show
 * an organisation a state the service disagrees with, about money.
 *
 * The dashboard goes with it: `reportsUsedThisPeriod` is the allowance the
 * account screen shows, and it is exactly what a licence just moved.
 */
export function useLicenseIncident() {
  const orgId = useOrgId();
  const client = useQueryClient();

  return useMutation<LicenceResult, unknown, string>({
    mutationFn: (incidentId: string) => api.licenseIncident(orgId!, incidentId),
    onSuccess: () => {
      if (!orgId) return;
      void client.invalidateQueries({ queryKey: orgKeys.inbox(orgId) });
      void client.invalidateQueries({ queryKey: orgKeys.dashboard(orgId) });
    },
  });
}

/** The organisation's own disposition of a report. */
export function useSetOrgIncidentStatus() {
  const orgId = useOrgId();
  const client = useQueryClient();

  return useMutation<void, unknown, { incidentId: string; status: OrgIncidentStatus }>({
    mutationFn: ({ incidentId, status }) => api.setOrgIncidentStatus(orgId!, incidentId, status),
    onSuccess: () => {
      if (orgId) void client.invalidateQueries({ queryKey: orgKeys.inbox(orgId) });
    },
  });
}

/**
 * Answering the person who filed the report.
 *
 * Nothing is invalidated: this writes to the *reporter's* outcome timeline,
 * which is not a thing this phone holds. Invalidating the inbox here would be a
 * refresh that changes nothing, on the screen somebody is reading.
 */
export function useRespondToIncident() {
  const orgId = useOrgId();

  return useMutation<void, unknown, { incidentId: string; action: OrgResponseAction; note?: string }>(
    {
      mutationFn: ({ incidentId, action, note }) =>
        api.respondToIncident(orgId!, incidentId, { action, ...(note ? { note } : {}) }),
    },
  );
}

/** Asking an editor to run a licensed report under this organisation's name. */
export function useRequestPublication() {
  const orgId = useOrgId();

  return useMutation<void, unknown, { incidentId: string } & PublicationRequest>({
    mutationFn: ({ incidentId, section, note }) =>
      api.requestPublication(orgId!, incidentId, { section, ...(note ? { note } : {}) }),
  });
}

export function useCreateAssignment() {
  const orgId = useOrgId();
  const client = useQueryClient();

  return useMutation<void, unknown, { incidentId: string; assigneeId: string; note?: string }>({
    mutationFn: (input) => api.createAssignment(orgId!, input),
    onSuccess: () => {
      if (!orgId) return;
      void client.invalidateQueries({ queryKey: orgKeys.assignments(orgId) });
      void client.invalidateQueries({ queryKey: orgKeys.dashboard(orgId) });
    },
  });
}

export function useUpdateAssignment() {
  const orgId = useOrgId();
  const client = useQueryClient();

  return useMutation<void, unknown, { id: string; status: OrgAssignment['status']; note?: string }>({
    mutationFn: ({ id, status, note }) =>
      api.updateAssignment(orgId!, id, { status, ...(note ? { note } : {}) }),
    onSuccess: () => {
      if (!orgId) return;
      void client.invalidateQueries({ queryKey: orgKeys.assignments(orgId) });
      void client.invalidateQueries({ queryKey: orgKeys.dashboard(orgId) });
    },
  });
}
