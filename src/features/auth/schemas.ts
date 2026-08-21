import { z } from 'zod';

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

export const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Enter a name people will see on your reports')
      .max(40, 'Keep this under 40 characters'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    // zod v4 takes `message` directly; `errorMap` was removed.
    acceptedTerms: z.literal(true, { message: 'You need to accept the terms to continue' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords need to match',
    path: ['confirmPassword'],
  });

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
