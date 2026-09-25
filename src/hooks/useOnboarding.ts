import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { hashFile, fileSize, readChunk } from '@/services/media';
import type { DocumentId, OnboardingApplication, OnboardingStepId } from '@/types/onboarding';

/**
 * The organisation's application to join the platform.
 *
 * Keyed by organisation id like every other org query, and enabled only once
 * one is known — these are `/org/*` routes and the service refuses them without
 * the scope header.
 *
 * The organisation here is read straight from the profile rather than through
 * `useOrgId`, which returns null for an unapproved account in some readings:
 * this is the one surface a *pending* organisation is allowed to use, so it
 * must work precisely when the rest of the organisation app does not.
 */
export function useApplicationOrgId(): string | null {
  return useAuthStore((s) => (s.profile?.accountType === 'organisation' ? s.profile.orgId : null));
}

export const onboardingKey = (orgId: string) => ['org', orgId, 'onboarding'] as const;

export function useOnboarding(): UseQueryResult<OnboardingApplication> {
  const orgId = useApplicationOrgId();
  return useQuery({
    queryKey: onboardingKey(orgId ?? ''),
    queryFn: () => api.getOnboarding(orgId!),
    enabled: Boolean(orgId),
  });
}

/**
 * Save a step's answers, or send it for review.
 *
 * Both write the same document, so both put the server's own answer straight
 * into the cache rather than invalidating: every one of these calls returns the
 * whole application, and a refetch would be a second round trip to learn what
 * the first already said.
 */
export function useSaveStep() {
  const orgId = useApplicationOrgId();
  const client = useQueryClient();

  return useMutation<
    OnboardingApplication,
    unknown,
    { stepId: OnboardingStepId; payload: Record<string, unknown>; send?: boolean }
  >({
    mutationFn: async ({ stepId, payload, send }) => {
      /*
       * Always saved before it is sent, in that order.
       *
       * `POST …/submit` takes an empty body — it sends whatever the service is
       * already holding. So submitting without saving first would send the last
       * *saved* answers and silently discard everything typed since, which on a
       * form somebody has just finished filling in is most of it.
       */
      const saved = await api.saveOnboardingStep(orgId!, stepId, payload);
      return send ? api.submitOnboardingStep(orgId!, stepId) : saved;
    },
    onSuccess: (application) => {
      if (orgId) client.setQueryData(onboardingKey(orgId), application);
    },
  });
}

/**
 * Attach a document: declare it, then send the bytes.
 *
 * The hash is computed over the file itself and sent with the declaration; the
 * service checks the bytes against it before counting the document attached. So
 * a half-completed upload cannot pass as a document — which matters, because a
 * platform owner approves an organisation's access to citizens' footage partly
 * on the strength of these.
 *
 * The application is refetched afterwards rather than edited here: the service
 * decides what a document leaves behind — whether it clears a step's
 * outstanding list, whether it replaces one already held — and guessing would
 * show an applicant a state the reviewer does not see.
 */
export function useAttachDocument() {
  const orgId = useApplicationOrgId();
  const client = useQueryClient();

  return useMutation<
    void,
    unknown,
    { documentType: DocumentId; uri: string; fileName: string; mimeType: string }
  >({
    mutationFn: async ({ documentType, uri, fileName, mimeType }) => {
      const byteSize = fileSize(uri);
      if (byteSize === 0) throw new Error('empty-file');

      const sha256 = await hashFile(uri);
      await api.attachOnboardingDocument(orgId!, {
        documentType,
        fileName,
        sha256,
        mimeType,
        byteSize,
      });

      /*
       * Read whole. These are photographs of certificates and ID cards — a
       * couple of megabytes — and the endpoint takes one PUT rather than the
       * chunked flow the footage uploader uses.
       */
      await api.uploadOnboardingDocumentBytes(
        orgId!,
        documentType,
        readChunk(uri, 0, byteSize),
        mimeType,
      );
    },
    onSuccess: () => {
      if (orgId) void client.invalidateQueries({ queryKey: onboardingKey(orgId) });
    },
  });
}

/** Send the finished application for review. */
export function useSubmitApplication() {
  const orgId = useApplicationOrgId();
  const client = useQueryClient();

  return useMutation<OnboardingApplication, unknown, void>({
    mutationFn: () => api.submitOnboarding(orgId!),
    onSuccess: (application) => {
      if (orgId) client.setQueryData(onboardingKey(orgId), application);
    },
  });
}
