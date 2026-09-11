import { describeApiError } from '../apiErrorCopy';
import { ApiError, type ApiErrorCode } from '@/types/api';
import en from '@/i18n/locales/en.json';

/**
 * What a user is told when a request fails.
 *
 * The contract is explicit that the server's `message` is developer-facing and
 * must not be shown — it is untranslated English and often names an internal
 * cause. The client switches on `code` instead.
 *
 * Against fixtures this never mattered, because nothing failed in a way worth
 * distinguishing. Against a live server it decides whether a reporter can act:
 * a GPS fix that was too loose is something they can fix by moving into the
 * open; "something went wrong" sends them to try the same thing in the same
 * place.
 */

const t = ((key: string, opts?: { defaultValue?: string }) => {
  const path = key.split('.');
  let node: unknown = en;
  for (const part of path) {
    if (node && typeof node === 'object' && part in node)
      node = (node as Record<string, unknown>)[part];
    else return opts?.defaultValue ?? key;
  }
  return typeof node === 'string' ? node : (opts?.defaultValue ?? key);
}) as unknown as Parameters<typeof describeApiError>[1];

const fallback = { title: 'Generic title', body: 'Generic body' };
const err = (code: ApiErrorCode) => new ApiError({ code, status: 500, message: 'internal detail' });

test('a known code gets its own words', () => {
  const copy = describeApiError(err('MAINTENANCE'), t, fallback);
  expect(copy.title).not.toBe(fallback.title);
  expect(copy.title).toMatch(/updated/i);
});

test('the server message is never shown', () => {
  /*
   * The whole point. `message` on that error is "internal detail" — an English
   * string written for a log — and it must not reach a screen.
   */
  const copy = describeApiError(err('INTERNAL'), t, fallback);
  expect(copy.title).not.toContain('internal detail');
  expect(copy.body).not.toContain('internal detail');
});

test('failures a reporter can act on say what to do', () => {
  // Not merely a different title: the body has to contain the action.
  expect(describeApiError(err('GPS_ACCURACY_REJECTED'), t, fallback).body).toMatch(/open|again/i);
  expect(describeApiError(err('MEDIA_TOO_LARGE'), t, fallback).body).toMatch(/shorter/i);
});

test('an outage says the work is not lost', () => {
  /*
   * The reassurance is the useful part. A reporter who has just filmed
   * something and sees an error assumes it is gone; both of these states are
   * recoverable and the copy has to say so.
   */
  expect(describeApiError(err('MAINTENANCE'), t, fallback).body).toMatch(/safe|queued|will send/i);
  expect(describeApiError(err('NETWORK_UNAVAILABLE'), t, fallback).body).toMatch(
    /nothing was lost|queued/i,
  );
});

test('an unknown code falls back to the screen', () => {
  // No worse than before this existed.
  const copy = describeApiError(err('IDEMPOTENCY_CONFLICT'), t, fallback);
  expect(copy).toEqual(fallback);
});

test('a non-API error falls back to the screen', () => {
  expect(describeApiError(new Error('boom'), t, fallback)).toEqual(fallback);
  expect(describeApiError(null, t, fallback)).toEqual(fallback);
});

test('every code with copy has both a title and a body', () => {
  const copy = (en as unknown as { apiError: Record<string, Record<string, string>> }).apiError;
  const broken = Object.entries(copy)
    .filter(([, v]) => !v.title || !v.body)
    .map(([k]) => k);
  expect(broken).toEqual([]);
});

test('the codes with copy are real codes', () => {
  /*
   * A typo in a key is silent: `describeApiError` would never find it and the
   * screen would quietly keep its generic words.
   */
  const known: ApiErrorCode[] = [
    'VALIDATION_FAILED',
    'TOKEN_EXPIRED',
    'TOKEN_INVALID',
    'FORBIDDEN',
    // Client-side only: the HTTP client narrows a guest's 403 on `/me/*` to
    // this, so the copy can say "make an account" instead of "ask your
    // administrator". No server ever sends it.
    'SIGN_IN_REQUIRED',
    'INCIDENT_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'UPLOAD_EXPIRED',
    'MEDIA_TOO_LARGE',
    'GPS_ACCURACY_REJECTED',
    'MEDIA_HASH_MISMATCH',
    'RATE_LIMITED',
    'INTERNAL',
    'MAINTENANCE',
    'NETWORK_UNAVAILABLE',
  ];
  const copy = (en as unknown as { apiError: Record<string, unknown> }).apiError;
  const unknown = Object.keys(copy).filter((k) => !known.includes(k as ApiErrorCode));
  expect(unknown).toEqual([]);
});
