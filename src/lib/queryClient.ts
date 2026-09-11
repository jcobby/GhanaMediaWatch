import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';

/**
 * One client for the app's lifetime.
 *
 * Retries are capped at two: on a flaky mobile connection an aggressive retry
 * policy turns one failed screen into thirty seconds of silent spinning, which
 * reads as a hang. Two attempts, then show the designed error state.
 *
 * **And only where a retry could work.** `retry: 2` on its own repeats
 * everything — a 403, a rejected password, a malformed request — none of which
 * change on the second attempt. All it buys is three times as long staring at a
 * spinner before being told something that was knowable immediately.
 *
 * `ApiError` already carries `retryable`; the outbox has switched on it since
 * it was written. This makes the screens agree with it.
 *
 * It lives here rather than in the root layout so that code outside React can
 * reach it. The upload engine finishes a report in the background, long after
 * the screen that started it has gone, and it has to be able to tell the cache
 * that "my reports" is now out of date — otherwise a reporter's own list keeps
 * serving the page it fetched before they filed anything.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && !error.retryable) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});
