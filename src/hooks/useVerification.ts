import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { hashFile, fileSize, readChunk } from '@/services/media';
import type {
  BloggerApplication,
  BloggerDocumentId,
  BloggerStepId,
} from '@/types/bloggerVerification';

/**
 * A blogger's application to publish under a checked byline.
 *
 * The same five calls as the organisation's onboarding in `useOnboarding`, on
 * `/me/*` rather than `/org/*` — so there is no organisation id to key by and
 * no scope header to carry. The mutations follow the same two rules, and both
 * were learned the hard way on the organisation side:
 *
 * 1. Save before sending, always. `POST …/submit` takes an empty body and sends
 *    whatever the service is already holding, so submitting without saving
 *    first discards everything typed since the last save.
 * 2. Put the server's own answer into the cache rather than invalidating. Every
 *    one of these calls returns the whole application, and refetching would be
 *    a second round trip to learn what the first already said.
 */

export const verificationKey = ['me', 'verification'] as const;

/**
 * Only a blogger has one.
 *
 * Gated on the account type rather than attempted for everybody: `/me/
 * verification` is meaningful for a blogger and a 404 or an empty application
 * for anyone else, and a query that fails by design on most accounts is noise
 * in every error report for the life of the app.
 */
export function useIsBlogger(): boolean {
  return useAuthStore((s) => s.profile?.accountType === 'blogger');
}

export function useVerification(): UseQueryResult<BloggerApplication> & { enabled: boolean } {
  const isBlogger = useIsBlogger();
  const query = useQuery({
    queryKey: verificationKey,
    queryFn: () => api.getVerification(),
    enabled: isBlogger,
  });

  /*
   * `enabled` is handed back, because a disabled query is not a loading one.
   *
   * react-query reports `isPending: true` for a query that has been switched
   * off and never fetched — there is no data and no error, which is the same
   * shape as "still waiting". A screen that renders a skeleton on `isPending`
   * therefore skeletons forever for anybody the store does not call a blogger:
   * a reporter who deep-links to the route, or a blogger whose profile was
   * hydrated before `/me` answered. `refetch()` is a no-op there too, so even
   * the error branch could not recover.
   */
  return { ...query, enabled: isBlogger };
}

/** Save a step's answers, or send it for review. */
export function useSaveVerificationStep() {
  const client = useQueryClient();

  return useMutation<
    BloggerApplication,
    unknown,
    { stepId: BloggerStepId; payload: Record<string, unknown>; send?: boolean }
  >({
    mutationFn: async ({ stepId, payload, send }) => {
      const saved = await api.saveVerificationStep(stepId, payload);
      return send ? api.submitVerificationStep(stepId) : saved;
    },
    onSuccess: (application) => client.setQueryData(verificationKey, application),
  });
}

/**
 * Attach a document: declare it, then send the bytes.
 *
 * The hash is computed over the file and sent with the declaration; the service
 * checks the bytes against it before counting the document attached, so a
 * half-finished upload cannot pass as one. That matters here for the same
 * reason it does for an organisation — somebody is being granted a byline the
 * public is asked to trust, partly on the strength of these.
 *
 * Refetched rather than edited in place: the service decides what a document
 * leaves behind, including whether it clears an alternative group, and guessing
 * would show an applicant a state their reviewer does not see.
 */
export function useAttachVerificationDocument() {
  const client = useQueryClient();

  return useMutation<
    void,
    unknown,
    { documentType: BloggerDocumentId; uri: string; fileName: string; mimeType: string }
  >({
    mutationFn: async ({ documentType, uri, fileName, mimeType }) => {
      const byteSize = fileSize(uri);
      if (byteSize === 0) throw new Error('empty-file');

      const sha256 = await hashFile(uri);
      await api.attachVerificationDocument({
        documentType,
        fileName,
        sha256,
        mimeType,
        byteSize,
      });

      /*
       * Read whole. These are photographs of an ID card or a utility bill — a
       * couple of megabytes — and the endpoint takes one PUT rather than the
       * chunked flow the footage uploader uses.
       */
      await api.uploadVerificationDocumentBytes(
        documentType,
        readChunk(uri, 0, byteSize),
        mimeType,
      );
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: verificationKey }),
  });
}

/** Send the finished application for review. */
export function useSubmitVerification() {
  const client = useQueryClient();

  return useMutation<BloggerApplication, unknown, void>({
    mutationFn: () => api.submitVerification(),
    onSuccess: (application) => client.setQueryData(verificationKey, application),
  });
}
