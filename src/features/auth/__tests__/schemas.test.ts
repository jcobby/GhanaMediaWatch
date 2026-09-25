import { forgotPasswordSchema, passwordStrength, signInSchema, signUpSchema } from '../schemas';

const validSignUp = {
  // Asked before anything else on the screen: it decides what the rest of the
  // form collects and what the service creates.
  accountKind: 'reporter' as const,
  displayName: 'Ama Kufuor',
  email: 'ama@example.gh',
  password: 'correct horse battery',
  confirmPassword: 'correct horse battery',
  acceptedTerms: true as const,
};

describe('email validation', () => {
  it.each(['ama@example.gh', 'a.b+tag@sub.domain.co.uk', 'x@y.io'])('accepts %s', (email) => {
    // Plus-addressing and long TLDs are valid; an aggressive regex would
    // reject real people's addresses.
    expect(forgotPasswordSchema.safeParse({ email }).success).toBe(true);
  });

  it.each(['', 'not-an-email', 'missing@tld', '@example.gh'])('rejects %s', (email) => {
    expect(forgotPasswordSchema.safeParse({ email }).success).toBe(false);
  });

  it('trims surrounding whitespace rather than rejecting it', () => {
    // Autofill and copy-paste routinely add a trailing space; failing on that
    // is a pointless obstacle.
    const result = forgotPasswordSchema.safeParse({ email: '  ama@example.gh  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('ama@example.gh');
  });

  it('explains what to do rather than naming the rule', () => {
    const result = forgotPasswordSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe('Enter your email address');
  });
});

describe('sign in', () => {
  it('accepts any non-empty password', () => {
    // Length rules belong on sign-up. Enforcing them at sign-in locks out
    // anyone who registered under an older policy.
    expect(signInSchema.safeParse({ email: 'a@b.io', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.io', password: '' }).success).toBe(false);
  });
});

describe('sign up', () => {
  it('accepts a valid submission', () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it('requires both passwords to match, and says so on the second field', () => {
    const result = signUpSchema.safeParse({ ...validSignUp, confirmPassword: 'something else' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error must attach to confirmPassword — showing it on the first
      // field makes people retype the password they got right.
      expect(result.error.issues[0]!.path).toEqual(['confirmPassword']);
    }
  });

  it('asks an organisation for its name, and a reporter for nothing extra', () => {
    /*
     * The name is what the service creates the pending organisation from —
     * `organisation.name` is its only required field — so an application
     * without one has nothing to review. A reporter never sees the field, and a
     * blanket rule would block them on something they were never shown.
     */
    const asOrg = { ...validSignUp, accountKind: 'organisation' as const };
    expect(signUpSchema.safeParse(asOrg).success).toBe(false);
    expect(
      signUpSchema.safeParse({ ...asOrg, organisationName: 'Accra Metropolitan Assembly' }).success,
    ).toBe(true);
    // The same submission as a reporter needs no organisation at all.
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it('rejects a password under ten characters', () => {
    const short = { ...validSignUp, password: 'abc123', confirmPassword: 'abc123' };
    expect(signUpSchema.safeParse(short).success).toBe(false);
  });

  it('accepts a long passphrase with no symbols or digits', () => {
    // Composition rules push people toward "Password1!"; a long phrase is
    // stronger and the schema should not punish it.
    const phrase = 'the drain by the market is blocked';
    expect(
      signUpSchema.safeParse({ ...validSignUp, password: phrase, confirmPassword: phrase }).success,
    ).toBe(true);
  });

  it('will not proceed without accepting the terms', () => {
    const result = signUpSchema.safeParse({ ...validSignUp, acceptedTerms: false });
    expect(result.success).toBe(false);
  });

  it('rejects a blank or single-character display name', () => {
    expect(signUpSchema.safeParse({ ...validSignUp, displayName: ' ' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...validSignUp, displayName: 'A' }).success).toBe(false);
  });
});

describe('password strength', () => {
  it('scores anything under the minimum as zero', () => {
    expect(passwordStrength('short')).toBe(0);
    expect(passwordStrength('123456789')).toBe(0);
  });

  it('rewards length over composition', () => {
    // A long plain phrase should not score below a short mixed-case string.
    expect(passwordStrength('a much longer passphrase here')).toBe(3);
    expect(passwordStrength('Ab1!ab1!ab')).toBeLessThan(3);
  });

  it('never exceeds its range', () => {
    const scores = ['', 'x'.repeat(200), 'correct horse battery staple'].map(passwordStrength);
    scores.forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(3);
    });
  });
});
