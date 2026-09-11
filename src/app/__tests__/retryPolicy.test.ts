import fs from 'fs';
import path from 'path';
import { ApiError } from '@/types/api';

/**
 * What is worth trying again.
 *
 * `retry: 2` as a bare number repeats every failure, including the ones that
 * cannot succeed: a rejected password, a 403, a malformed request. The user
 * waits three times as long to be told something the first response already
 * said.
 *
 * With a dead backend it was worse than slow — three attempts at a twenty
 * second timeout is a minute of spinner, which is indistinguishable from the
 * app having hung.
 */

/** The policy as `lib/queryClient.ts` configures it, extracted so it can be exercised. */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ApiError && !error.retryable) return false;
  return failureCount < 2;
};

const err = (retryable: boolean) =>
  new ApiError({ code: 'INTERNAL', status: 500, message: 'x', retryable });

test('a dropped connection is retried', () => {
  // The case retries exist for: nothing was wrong with the request.
  expect(shouldRetry(0, err(true))).toBe(true);
  expect(shouldRetry(1, err(true))).toBe(true);
});

test('retries stop after two', () => {
  expect(shouldRetry(2, err(true))).toBe(false);
});

test('a permanent failure is not retried at all', () => {
  /*
   * The bug. A 403 or a rejected password is the same on the third attempt as
   * the first, and the only thing repeating it changes is how long the person
   * waits for the answer.
   */
  expect(shouldRetry(0, err(false))).toBe(false);
});

test('an unknown error still gets its retries', () => {
  // A thrown TypeError from a parsing bug is not an ApiError and carries no
  // verdict. Retrying is the safer default there.
  expect(shouldRetry(0, new Error('boom'))).toBe(true);
  expect(shouldRetry(2, new Error('boom'))).toBe(false);
});

test('the client uses this policy, not a bare number', () => {
  /*
   * Pinned against the source: `retry: 2` typechecks, runs, and silently
   * reinstates the whole problem.
   *
   * The client moved out of `_layout.tsx` into its own module so the upload
   * engine — which finishes reports in the background, with no component
   * mounted — can invalidate "my reports" when one lands.
   */
  const src = fs.readFileSync(path.resolve(__dirname, '../../lib/queryClient.ts'), 'utf8');

  expect(src).toMatch(/retry:\s*\(failureCount, error\)/);
  expect(src).not.toMatch(/retry:\s*\d+\s*,/);
});

test('the layout still installs that one client', () => {
  /*
   * The move's own failure mode: a second `new QueryClient` left behind in the
   * layout would give the app two caches. Everything would look right — the
   * screens would render, the uploader would invalidate — and the invalidation
   * would land on a cache no screen was reading from.
   */
  const layout = fs.readFileSync(path.resolve(__dirname, '../_layout.tsx'), 'utf8');

  expect(layout).toMatch(/import \{ queryClient \} from '@\/lib\/queryClient'/);
  expect(layout).toMatch(/<QueryClientProvider client=\{queryClient\}>/);
  expect(layout).not.toMatch(/new QueryClient\(/);
});
