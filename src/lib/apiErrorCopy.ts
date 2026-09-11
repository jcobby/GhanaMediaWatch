import type { TFunction } from 'i18next';
import { ApiError } from '@/types/api';

/**
 * User-facing words for an API failure.
 *
 * The contract is explicit that a server `message` is developer-facing and must
 * never be shown: it is English, untranslated, and often describes an internal
 * cause. The client is supposed to switch on `code` instead — and until the
 * backend was live it never had to, so every failure surfaced as the same
 * screen-level "something went wrong".
 *
 * That is tolerable against fixtures and wrong against a real server. A reporter
 * whose upload was refused because the GPS fix was too loose can do something
 * about it; one told "something went wrong" cannot, and will try the same thing
 * again in the same place.
 *
 * Falls back to whatever the screen would have said, so a code with no specific
 * copy is no worse than before.
 */
export function describeApiError(
  error: unknown,
  t: TFunction,
  fallback: { title: string; body: string },
): { title: string; body: string } {
  if (!(error instanceof ApiError)) return fallback;

  const title = t(`apiError.${error.code}.title`, { defaultValue: '' });
  const body = t(`apiError.${error.code}.body`, { defaultValue: '' });

  // i18next returns the key itself for a miss unless a default is given; an
  // empty default makes the miss detectable rather than printing `apiError.X`.
  return title && body ? { title, body } : fallback;
}
