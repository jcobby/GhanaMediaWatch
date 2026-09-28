import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { ACCOUNT_KINDS, signUpSchema } from '../schemas';
import {
  BLOGGER_STEPS,
  outstandingFor,
  readyToSubmit,
  type BloggerApplication,
} from '@/types/bloggerVerification';
import { normaliseVerification } from '@/api/verificationShape';

/**
 * Registering as a blogger, and the verification it opens.
 *
 * **A blogger is a verified individual, not a one-person institution.** That
 * choice is the whole design and it is easy to undo by accident: modelling them
 * as an organisation would work mechanically and would give them an inbox they
 * cannot use, a listing in the public *organisation* directory beside
 * government agencies, and reports routed to them by §6. The rules below exist
 * to keep that from happening quietly.
 *
 * The second thing worth protecting: **nothing about verification blocks them.**
 * `/me` returns `kind: "user"` for a blogger, so every reporter route works from
 * the moment they register. A screen that gated filing on an approved
 * application would be inventing a restriction the service does not have.
 */

const SRC = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Comments stripped, because these rules are about code.
 *
 * The first version of the organisation rule below matched this file's own
 * prose — a comment explaining that a blogger "is not an organisation" contains
 * the word, and the assertion failed on the sentence written to describe it.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const SIGN_UP = stripComments(read('features/auth/SignUpScreen.tsx'));
const STORE = stripComments(read('stores/authStore.ts'));
const CLIENT = stripComments(read('api/client.ts'));

const validBlogger = {
  accountKind: 'blogger' as const,
  displayName: 'Ama Kufuor',
  email: 'ama@example.gh',
  payoutMsisdn: '024 123 4567',
  password: 'correct horse battery',
  confirmPassword: 'correct horse battery',
  acceptedTerms: true as const,
};

test('the files under review were read', () => {
  expect(SIGN_UP.length).toBeGreaterThan(2000);
  expect(STORE.length).toBeGreaterThan(2000);
});

describe('choosing it', () => {
  test('there are three kinds, and the blogger sits between the other two', () => {
    // Most people signing up are individuals; the least common choice should
    // not be first, and an organisation is the most involved so it is last.
    expect([...ACCOUNT_KINDS]).toEqual(['reporter', 'blogger', 'organisation']);
  });

  test('every kind has a name and an explanation', () => {
    const kind = en.auth.kind as unknown as Record<string, string>;
    const help = en.auth.kindHelp as unknown as Record<string, string>;
    for (const value of ACCOUNT_KINDS) {
      expect([value, typeof kind[value]]).toEqual([value, 'string']);
      expect([value, typeof help[value]]).toEqual([value, 'string']);
    }
    // The explanation has to answer "why would I pick this over an individual".
    expect(help.blogger).toMatch(/verif/i);
  });

  test('each kind has its own glyph', () => {
    /*
     * A map, not the ternary this replaced — which could only answer two
     * things, so a third kind silently got the person icon. A blogger *is* an
     * individual, and two cards showing the same glyph is a choice the eye
     * cannot make.
     */
    expect(SIGN_UP).toMatch(/const KIND_ICON: Record<SignUpKind, keyof typeof Ionicons\.glyphMap>/);
    expect(SIGN_UP).toMatch(/blogger: '[a-z-]+'/);
    expect(SIGN_UP).not.toMatch(/value === 'organisation' \? 'business-outline' : 'person-outline'/);
  });
});

describe('what registering one does', () => {
  test('the kind reaches the service', () => {
    expect(SIGN_UP).toMatch(/\{ accountKind: 'blogger' as const \}/);
    expect(STORE).toMatch(/accountKind === 'blogger'\s*\?\s*\{ accountKind: 'blogger' as const \}/);
    // And the wire type admits it, or the call would not compile against `/auth/register`.
    expect(CLIENT).toMatch(/accountKind\?: 'user' \| 'blogger' \| 'organisation'/);
  });

  test('it does not create an organisation', () => {
    /*
     * The failure this whole file guards. `organisation` on the request body is
     * what the service reads as "create a pending organisation", and a blogger
     * must never send one.
     */
    const submit = SIGN_UP.slice(SIGN_UP.indexOf('const onSubmit'), SIGN_UP.indexOf('return ('));
    const bloggerBranch = submit.slice(submit.indexOf("=== 'blogger'"));
    expect(bloggerBranch).not.toMatch(/organisation:/);
  });

  test('a payout number is still required — a blogger earns like a reporter', () => {
    expect(signUpSchema.safeParse(validBlogger).success).toBe(true);
    expect(signUpSchema.safeParse({ ...validBlogger, payoutMsisdn: '' }).success).toBe(false);
  });

  test('they are told the account works *and* that verification is pending', () => {
    /*
     * Two facts, and either alone misleads. "Account created" hides the
     * application; "application started" implies they cannot file yet, which is
     * the opposite of true.
     */
    expect(SIGN_UP).toMatch(/auth\.bloggerCreatedTitle/);
    expect(en.auth.bloggerCreatedBody).toMatch(/straight away|right away/i);
    expect(en.auth.bloggerCreatedBody).toMatch(/verif/i);
  });

  test('an unverified blogger is sent to the app, not to a waiting screen', () => {
    /*
     * Unlike a pending organisation, which gets `403 check: "org_pending"` from
     * every `/org/*` route and must go to its application. `homeRouteFor` sends
     * everything that is not an organisation to the tabs, and that is correct
     * for a blogger — the test is here because "treat it like the org" is the
     * obvious wrong turn.
     */
    const home = stripComments(read('lib/homeRoute.ts'));
    expect(home).toMatch(/accountType !== 'organisation'/);
    expect(home).not.toMatch(/blogger/);
  });
});

describe('the verification it opens', () => {
  const empty = (): BloggerApplication =>
    normaliseVerification({
      id: 'pva_1',
      reference: 'ONB-PER-FB2036',
      steps: {},
      documents: [],
      missingDocuments: ['officer_id', 'utility_bill_or_premises_proof'],
    });

  test('the service’s own payload is understood', () => {
    // Read off a freshly registered blogger on 28 September. `steps` is a map,
    // not the list the open schema might suggest.
    const app = empty();
    expect(app.reference).toBe('ONB-PER-FB2036');
    expect(app.steps).toEqual({});
    expect(app.missingDocuments).toContain('utility_bill_or_premises_proof');
  });

  test('a step reports what is missing by name', () => {
    // "Complete this step" on a form with nine inputs is a puzzle.
    const out = outstandingFor(empty(), 'identity');
    expect(out.fields).toEqual(['legalName', 'idNumber', 'phone']);
    expect(out.documents).toEqual(['officer_id']);
  });

  test('an address requirement is one item, not two', () => {
    /*
     * A utility bill and a proof of address both prove the same thing and
     * either satisfies it — the service names the pair
     * `utility_bill_or_premises_proof` for that reason. Listing both reads as
     * two things to go and find, which is how an application stalls on
     * paperwork that adds nothing.
     */
    const out = outstandingFor(empty(), 'coverage');
    expect(out.documents).toHaveLength(1);

    const withBill = normaliseVerification({
      id: 'pva_1',
      steps: {},
      documents: [{ id: 'utility_bill', fileName: 'bill.jpg' }],
      missingDocuments: [],
    });
    expect(outstandingFor(withBill, 'coverage').documents).toEqual([]);
  });

  test('nothing can be submitted until every step and document is done', () => {
    expect(readyToSubmit(empty())).toBe(false);

    const complete = normaliseVerification({
      id: 'pva_1',
      steps: Object.fromEntries(
        BLOGGER_STEPS.map((step) => [
          step.id,
          {
            status: 'in_progress',
            payload: Object.fromEntries(step.fields.map((f) => [f.key, 'x'])),
          },
        ]),
      ),
      documents: [
        { id: 'officer_id', fileName: 'id.jpg' },
        { id: 'premises_proof', fileName: 'address.jpg' },
      ],
      missingDocuments: [],
    });
    expect(readyToSubmit(complete)).toBe(true);

    // And not twice: an application already sent is not ready to send again.
    expect(readyToSubmit({ ...complete, submittedAtIso: '2026-09-28T00:00:00Z' })).toBe(false);
  });

  test('it asks a person for a person’s papers', () => {
    /*
     * Three steps, not the organisation's four. There is no legal entity to
     * register and no premises, and asking for a certificate of incorporation
     * would be asking somebody to prove they are a company.
     */
    expect(BLOGGER_STEPS.map((s) => s.id)).toEqual(['identity', 'presence', 'coverage']);
    const documents = BLOGGER_STEPS.flatMap((s) => s.documents);
    expect(documents).not.toContain('business_registration');
    expect(documents).not.toContain('authorisation_letter');
    expect(documents).toContain('officer_id');
  });

  test('where they publish is asked for, because that is the thing being checked', () => {
    // A Ghana Card proves who they are; it does not prove they are a publisher.
    const presence = BLOGGER_STEPS.find((s) => s.id === 'presence')!;
    expect(presence.fields.filter((f) => f.required).map((f) => f.key)).toEqual([
      'publicationName',
      'url',
    ]);
  });

  test('every field and document on the steps has words', () => {
    const field = en.verify.field as unknown as Record<string, string>;
    const placeholder = en.verify.placeholder as unknown as Record<string, string>;
    for (const step of BLOGGER_STEPS) {
      for (const f of step.fields) {
        expect([f.key, typeof field[f.key]]).toEqual([f.key, 'string']);
        expect([f.key, typeof placeholder[f.key]]).toEqual([f.key, 'string']);
      }
    }
  });
});
