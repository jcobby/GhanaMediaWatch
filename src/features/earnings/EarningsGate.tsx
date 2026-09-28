import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { describeApiError } from '@/lib/apiErrorCopy';
import { ApiError } from '@/types/api';

/**
 * What the money screens show when there is no money to show yet.
 *
 * **Both of them rendered GH₵0.00 instead.** `useEarnings` was destructured for
 * `data` alone and defaulted to a zeroed summary, so three different situations
 * arrived on screen as the same sentence — a reporter who has genuinely earned
 * nothing, a reporter whose connection failed, and a **guest**, for whom
 * `/me/earnings` answers 403 because the `/me/*` endpoints are refused to a
 * device token.
 *
 * The last is the one that matters. Somebody who has not made an account opens
 * the Earn tab and is told, in the app's most confident typography, that their
 * balance is zero and they are some distance from a payout. It is an answer to
 * a question they never asked, about an account they do not have, and it is the
 * opposite of the invitation that screen exists to make.
 *
 * Returns `null` when the data is fine, so a caller reads as:
 *
 *     const gate = useEarningsGate(query);
 *     if (gate) return gate;
 *
 * Kept as a hook returning an element rather than a wrapper component so each
 * screen keeps its own layout — the Earn tab and the wallet frame this
 * differently, and only the *decision* is shared.
 */
export function useEarningsGate({
  isPending,
  isError,
  error,
  refetch,
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}): React.ReactElement | null {
  const { t } = useTranslation();
  const router = useRouter();

  if (isPending) return <SkeletonList count={3} />;
  if (!isError) return null;

  /*
   * A guest is not an error, and must not be offered "Try again" — the request
   * would be refused identically every time. The way out is an account, so that
   * is the button.
   */
  if (error instanceof ApiError && error.code === 'SIGN_IN_REQUIRED') {
    return (
      <EmptyState
        icon="wallet-outline"
        title={t('earnings.guestTitle')}
        description={t('earnings.guestBody')}
        actionLabel={t('auth.getStarted')}
        onAction={() => router.push('/(auth)/welcome')}
      />
    );
  }

  const copy = describeApiError(error, t, {
    title: t('earnings.unavailableTitle'),
    body: t('earnings.unavailableBody'),
  });

  return (
    <ErrorState
      title={copy.title}
      description={copy.body}
      retryLabel={t('common.retry')}
      onRetry={refetch}
    />
  );
}
