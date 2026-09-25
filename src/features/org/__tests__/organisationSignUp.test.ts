import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import { normaliseOnboarding } from '@/api/onboardingShape';
import {
  DOCUMENT_REQUIREMENTS,
  ONBOARDING_STEPS,
  isEditable,
  outstandingFor,
  readyToSubmit,
  stepState,
  type DocumentId,
} from '@/types/onboarding';

/**
 * Applying to become an organisation, from the phone.
 *
 * Registration creates a **pending** organisation; a platform administrator
 * approves it. Everything below protects one of the two rules that gives the
 * flow its shape — the applicant never approves their own evidence, and a
 * pending account is never sent somewhere the service will only refuse it.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ─── the service's shape ───────────────────────────────────────────────────

/**
 * What `GET /org/onboarding` actually sends, recorded by the console against
 * the live service on 15 September. The endpoint declares `steps` as an array
 * and sends a map; handed straight to a list-shaped consumer, `steps.find` is
 * not a function and the screen crashes.
 */
const LIVE_PAYLOAD = {
  id: 'onb_1',
  orgId: 'org_1',
  reference: 'ONB-ORG-000002',
  steps: {
    organisation: {
      status: 'submitted',
      payload: { legalName: 'Accra Metropolitan Assembly', registrationNumber: 'CS-1' },
      updatedAtIso: '2026-09-15T10:00:00.000Z',
      rejectionNote: null,
    },
    officer: { status: 'returned', payload: { name: 'Ama' }, rejectionNote: 'ID was unreadable' },
  },
  documents: [
    {
      id: 'business_registration',
      fileName: 'cert.jpg',
      sha256: 'abc',
      uploadedAtIso: '2026-09-15T10:00:00.000Z',
    },
    // A type this app has no slot for. Rendered raw it would read as a
    // requirement nobody can satisfy.
    { id: 'something_new', fileName: 'x.jpg', sha256: 'def' },
  ],
  submittedAtIso: null,
};

test('the map the service sends is read, not crashed on', () => {
  const view = normaliseOnboarding(LIVE_PAYLOAD);

  expect(view.id).toBe('onb_1');
  expect(stepState(view, 'organisation').status).toBe('submitted');
  expect(view.payloads.organisation?.legalName).toBe('Accra Metropolitan Assembly');
  // `returned` is the reviewer's word for what this app calls `rejected`.
  expect(stepState(view, 'officer').status).toBe('rejected');
  expect(stepState(view, 'officer').rejectionReason).toBe('ID was unreadable');
});

test('a list-shaped response is read too', () => {
  // An older build sent an array. Guessing wrong either way shows an applicant
  // none of the work they have already done.
  const view = normaliseOnboarding({
    id: 'onb_2',
    steps: [{ id: 'coverage', status: 'in_progress', payload: { city: 'Accra' } }],
  });
  expect(stepState(view, 'coverage').status).toBe('in_progress');
  expect(view.payloads.coverage?.city).toBe('Accra');
});

test('an unknown document type is dropped rather than shown', () => {
  const view = normaliseOnboarding(LIVE_PAYLOAD);
  expect(view.documents.map((d) => d.id)).toEqual(['business_registration']);
});

test('an unrecognised status is never read as approved', () => {
  /*
   * The decide endpoint documents no body and the reviewer's side has not been
   * observed. Reading a word nobody recognises as `approved` would tell an
   * applicant a step passed review when nobody said so.
   */
  const view = normaliseOnboarding({ steps: { coverage: { status: 'something_else' } } });
  expect(stepState(view, 'coverage').status).toBe('in_progress');
});

test('garbage does not throw', () => {
  // The endpoint publishes almost no schema, so this is a real possibility.
  expect(normaliseOnboarding(null).steps).toEqual([]);
  expect(normaliseOnboarding('nonsense').documents).toEqual([]);
});

// ─── the rules the applicant is held to ────────────────────────────────────

test('a submitted step can no longer be edited', () => {
  /*
   * The applicant submits; the platform approves. A step that could be changed
   * after it was sent is evidence a reviewer cannot rely on.
   */
  expect(isEditable('not_started')).toBe(true);
  expect(isEditable('in_progress')).toBe(true);
  // Sent back with a reason — editable again, which is the point of sending it
  // back rather than declining the whole application.
  expect(isEditable('rejected')).toBe(true);
  expect(isEditable('submitted')).toBe(false);
  expect(isEditable('approved')).toBe(false);
});

test('a step names what it is still missing', () => {
  const step = ONBOARDING_STEPS[0]!;
  const outstanding = outstandingFor(step, { legalName: 'AMA' }, []);

  expect(outstanding.fields).toEqual(['registrationNumber']);
  expect(outstanding.documents).toEqual(['business_registration', 'tax_identification']);
  // An optional field is never outstanding.
  expect(outstanding.fields).not.toContain('tin');
});

test('the application cannot be sent until every step has gone', () => {
  const documents = (Object.keys(DOCUMENT_REQUIREMENTS) as DocumentId[]).map((id) => ({
    id,
    fileName: 'x',
    sha256: 'y',
    uploadedAtIso: null,
  }));

  const sentSteps = ONBOARDING_STEPS.filter((s) => s.id !== 'documents').map((s) => ({
    id: s.id,
    status: 'submitted' as const,
    rejectionReason: null,
    submittedAtIso: '2026-09-18T00:00:00.000Z',
  }));

  const base = { id: 'a', status: 'draft', payloads: {}, submittedAtIso: null };

  expect(readyToSubmit({ ...base, steps: sentSteps, documents })).toBe(true);
  // One document short.
  expect(readyToSubmit({ ...base, steps: sentSteps, documents: documents.slice(1) })).toBe(false);
  // One step short.
  expect(readyToSubmit({ ...base, steps: sentSteps.slice(1), documents })).toBe(false);
  expect(readyToSubmit(undefined)).toBe(false);
});

// ─── how the app behaves around it ─────────────────────────────────────────

test('a step is saved before it is sent', () => {
  /*
   * `POST …/submit` takes an empty body — it sends whatever the service already
   * holds. Submitting without saving first would send the last *saved* answers
   * and silently discard everything typed since, which on a form somebody has
   * just finished is most of it.
   */
  const hook = code('hooks/useOnboarding.ts');
  expect(hook).toMatch(/const saved = await api\.saveOnboardingStep\(/);
  expect(hook).toMatch(/return send \? api\.submitOnboardingStep\(/);
});

test('a document is declared and then its bytes sent', () => {
  /*
   * Both calls, in that order. Declaring alone would leave a platform owner
   * approving access to citizens' footage on the strength of a filename — the
   * service checks the bytes against the declared hash before it counts the
   * document attached.
   */
  const hook = code('hooks/useOnboarding.ts');
  const attach = hook.slice(hook.indexOf('useAttachDocument'));
  expect(attach.indexOf('attachOnboardingDocument')).toBeLessThan(
    attach.indexOf('uploadOnboardingDocumentBytes'),
  );
  expect(attach).toMatch(/const sha256 = await hashFile\(uri\)/);
});

test('a pending organisation is sent to its application, not to the inbox', () => {
  /*
   * The service refuses every `/org/*` route but onboarding for one —
   * `check: "org_pending"` — so the four tabs would each render a refusal on an
   * account with nothing wrong with it.
   */
  expect(code('lib/homeRoute.ts')).toMatch(
    /profile\.orgVerified === false \? '\/onboarding\/organisation' : '\/\(org\)'/,
  );
  expect(code('app/(org)/_layout.tsx')).toMatch(
    /if \(pending\) return <Redirect href="\/onboarding\/organisation" \/>/,
  );
});

test('registration only asks for an organisation when one was chosen', () => {
  /*
   * The service reads the presence of `organisation` as "create a pending
   * organisation", so a stray empty object on a reporter's registration applies
   * to join the platform on their behalf.
   */
  const screen = code('features/auth/SignUpScreen.tsx');
  expect(screen).toMatch(/values\.accountKind === 'organisation'\s*\?\s*\{\s*organisation:/);
  expect(code('api/http.ts')).toMatch(/\.\.\.\(accountKind \? \{ accountKind \} : \{\}\)/);
});

test('the organisation is read back from the service, not assumed', () => {
  /*
   * Registering *asks* for an organisation; `/me` says whether one was created,
   * under what id, and whether it is approved — which it is not. Taking the id
   * from our own request would be the client granting itself a membership.
   */
  const store = code('stores/authStore.ts');
  expect(store).toMatch(/const org = organisation \? await describeOrg\(\) : null;/);
  expect(store).toMatch(/orgVerified: org \? org\.verified : undefined/);
});

test('every step, field and document has words for it', () => {
  const apply = en.apply as unknown as Record<string, Record<string, string> | undefined>;

  for (const step of ONBOARDING_STEPS) {
    expect(apply.step?.[step.id]).toBeTruthy();
    expect(apply.stepHelp?.[step.id]).toBeTruthy();
    for (const field of step.fields) expect(apply.field?.[field.key]).toBeTruthy();
    for (const id of step.documents) expect(apply.document?.[id]).toBeTruthy();
  }
  for (const id of Object.keys(DOCUMENT_REQUIREMENTS)) {
    expect(apply.document?.[id]).toBeTruthy();
  }
});

test('there is a way out that is not finishing the application', () => {
  /*
   * This screen replaces the whole app for a pending account. Somebody who
   * started it on the wrong account, or who wants to file a report while they
   * wait, otherwise has no exit at all.
   */
  expect(code('features/org/OrgOnboardingScreen.tsx')).toMatch(/void signOut\(\)/);
});
