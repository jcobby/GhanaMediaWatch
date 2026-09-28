import { z } from 'zod';
import { toGhanaMsisdn } from '@/lib/momo';

/**
 * Form validation for the auth screens.
 *
 * Zod rather than hand-rolled checks so one schema produces both the runtime
 * validation and the TypeScript type of the submitted values — they cannot
 * drift apart, which is the usual failure of hand-written form validation.
 *
 * Messages are written for the person reading them, not for a developer: they
 * say what to do, not what rule failed.
 */

/**
 * Email.
 *
 * Deliberately permissive beyond a basic shape check. Aggressive email regexes
 * reject valid addresses — plus-addressing, long TLDs, non-Latin domains — and
 * the only real proof an address works is sending to it.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('That does not look like an email address');

/**
 * Password.
 *
 * Length only. Composition rules (a symbol, a digit, mixed case) push people
 * toward predictable substitutions like "Password1!" and are weaker in practice
 * than a longer passphrase, so the floor is raised to 10 instead.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters — a short phrase works well');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

/**
 * What kind of account is being created.
 *
 * Not a preference — the three produce different things on the service.
 *
 * - `reporter` gets an account and can file immediately.
 * - `blogger` gets the same account **plus a verification application**. They
 *   can file from the moment they register; what verification adds is a byline
 *   a reader can see has been checked. Crucially they are not blocked while it
 *   is pending — `/me` returns `kind: "user"` for them, so every route a
 *   reporter may call, they may call.
 * - `organisation` gets a *pending* organisation that a platform administrator
 *   has to approve before it can reach anything at all.
 *
 * That last difference is the one that shapes the routing: a pending
 * organisation gets `403 check: "org_pending"` from every `/org/*` route but
 * onboarding, so it must be sent to its application. An unverified blogger has
 * a working app and is sent to it.
 *
 * The order is the order of the cards, and it is deliberate: most people
 * signing up are individuals, and the least common choice should not be first.
 */
export const ACCOUNT_KINDS = ['reporter', 'blogger', 'organisation'] as const;
export type SignUpKind = (typeof ACCOUNT_KINDS)[number];

export const signUpSchema = z
  .object({
    /*
     * Required, and answered before anything is typed.
     *
     * Not `.default('reporter')`, tempting as that is: a zod default makes the
     * parsed output required while the input stays optional, and
     * react-hook-form then types the form on one and the resolver on the other.
     * The form always supplies this — it is the first thing the screen asks —
     * so there is nothing for a default to rescue.
     *
     * The service's own default lives where it belongs, at the boundary:
     * `http.ts` omits `accountKind` unless one was chosen, and `/auth/register`
     * reads an absent one as a reporter.
     */
    accountKind: z.enum(ACCOUNT_KINDS),
    displayName: z
      .string()
      .trim()
      .min(2, 'Enter a name people will see on your reports')
      .max(40, 'Keep this under 40 characters'),
    /**
     * The institution's own name, as it should appear on the platform.
     *
     * Optional in the schema and required by the refinement below, because it
     * is only asked of an organisation — a reporter never sees the field, and a
     * blanket `min(2)` would block them on something they were never shown.
     */
    organisationName: z.string().trim().max(80, 'Keep this under 80 characters').optional(),
    organisationSector: z
      .enum(['government', 'media', 'utility', 'insurance', 'ngo', 'research', 'other'])
      .optional(),
    email: emailSchema,
    /**
     * Where commissions are paid, asked for while the account is being made.
     *
     * A reporter earns the moment an organisation licenses their footage, and
     * a commission with no wallet behind it is held rather than paid — so the
     * number was being collected on the earnings screen, which somebody visits
     * *after* they have already earned something and wondered where it went.
     *
     * Optional in the schema and required by the refinement below, because an
     * organisation is never shown the field: it pays for subscriptions rather
     * than receiving commissions, and a blanket requirement would block it on
     * something it was never asked.
     */
    payoutMsisdn: z.string().trim().optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
    // zod v4 takes `message` directly; `errorMap` was removed.
    acceptedTerms: z.literal(true, { message: 'You need to accept the terms to continue' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords need to match',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => data.accountKind !== 'organisation' || (data.organisationName ?? '').length >= 2,
    {
      message: 'Enter the name of the organisation',
      path: ['organisationName'],
    },
  )
  /*
   * Checked on the phone, where it can still be corrected.
   *
   * `toGhanaMsisdn` is the same function the earnings screen and the API
   * client use, so a number accepted here is one the service will accept. A
   * mistyped wallet that passes registration surfaces weeks later as a payout
   * that never arrived, and by then nobody remembers typing it.
   */
  .refine(
    (data) => data.accountKind === 'organisation' || toGhanaMsisdn(data.payoutMsisdn ?? '') !== null,
    {
      message: 'Enter the mobile money number that should receive your commissions',
      path: ['payoutMsisdn'],
    },
  );

export const forgotPasswordSchema = z.object({ email: emailSchema });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/**
 * A rough strength read for the sign-up meter.
 *
 * Length-dominant on purpose, matching the schema's reasoning: a 16-character
 * phrase is stronger than an 8-character string with a symbol bolted on.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < 10) return 0;
  if (password.length >= 20) return 3;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length >= 14 || variety >= 3) return 2;
  return 1;
}
