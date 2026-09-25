/**
 * Institutional onboarding.
 *
 * Registration says who is asking. Onboarding is the evidence, and it is a
 * different shape of thing: a sequence of steps an applicant works through at
 * their own pace, each submitted and then reviewed by a platform administrator
 * before any of it counts.
 *
 * Two rules give the flow its shape, and they are the reason it cannot be
 * collapsed into a longer sign-up form:
 *
 *   1. **The applicant submits; the platform approves.** Completing a step never
 *      approves it. An organisation that could mark its own evidence acceptable
 *      is an organisation that has not been checked — and these accounts receive
 *      footage of identifiable people.
 *
 *   2. **Approval is per step.** Reviewing an application as one blob means a
 *      reviewer accepts everything or rejects everything, and the applicant is
 *      told "declined" with no idea which document was wrong.
 *
 * **Hand-synced with `packages/core/src/logic/onboarding.ts` in the console
 * repo**, the same way `NewsSection` is: the phone does not consume
 * `@dawuro/core`. The step ids and document ids are what the *service* keys on —
 * `PUT /org/onboarding/steps/{stepId}` and
 * `PUT /org/onboarding/documents/{documentType}/bytes` — so a value that drifts
 * between the two clients is an application the other one cannot read.
 */

export type OnboardingStepId = 'organisation' | 'officer' | 'coverage' | 'documents';

export type StepStatus =
  /** Not opened yet. */
  | 'not_started'
  /** Opened, partly filled, not sent. */
  | 'in_progress'
  /** Sent for review. The applicant can no longer edit it. */
  | 'submitted'
  /** A reviewer accepted it. */
  | 'approved'
  /** A reviewer sent it back, with a reason. */
  | 'rejected';

export type DocumentId =
  | 'business_registration'
  | 'tax_identification'
  | 'officer_id'
  | 'authorisation_letter'
  | 'premises_proof';

export interface OnboardingStepMeta {
  id: OnboardingStepId;
  /** Documents this step expects. */
  documents: DocumentId[];
  /** Payload keys the service stores, and which of them the step cannot be sent without. */
  fields: { key: string; required: boolean; numeric?: boolean }[];
}

/**
 * The four steps, in order.
 *
 * Categories and the plan are deliberately *not* steps: they are chosen at
 * registration, where an organisation answers them from memory in under a
 * minute. They were once asked here too, and asking twice made the first pass
 * look pointless and the second look like the form had forgotten.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepMeta[] = [
  {
    id: 'organisation',
    documents: ['business_registration', 'tax_identification'],
    fields: [
      { key: 'legalName', required: true },
      { key: 'registrationNumber', required: true },
      { key: 'tin', required: false },
    ],
  },
  {
    id: 'officer',
    documents: ['officer_id', 'authorisation_letter'],
    fields: [
      { key: 'name', required: true },
      { key: 'role', required: false },
      { key: 'idNumber', required: true },
      { key: 'phone', required: false },
    ],
  },
  {
    id: 'coverage',
    documents: ['premises_proof'],
    fields: [
      { key: 'address', required: true },
      { key: 'city', required: true },
      { key: 'areaLabel', required: false },
      { key: 'radiusKm', required: false, numeric: true },
    ],
  },
  // The last step attaches nothing of its own: it is everything gathered so far,
  // and the one place the application as a whole can be sent.
  { id: 'documents', documents: [], fields: [] },
];

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = ONBOARDING_STEPS.map((s) => s.id);

export interface DocumentRequirement {
  id: DocumentId;
  required: boolean;
}

export const DOCUMENT_REQUIREMENTS: Record<DocumentId, DocumentRequirement> = {
  business_registration: { id: 'business_registration', required: true },
  tax_identification: { id: 'tax_identification', required: true },
  officer_id: { id: 'officer_id', required: true },
  authorisation_letter: { id: 'authorisation_letter', required: true },
  premises_proof: { id: 'premises_proof', required: true },
};

export interface UploadedDocument {
  id: DocumentId;
  fileName: string;
  /** What the service checks the bytes against before counting it attached. */
  sha256: string;
  uploadedAtIso: string | null;
}

export interface OnboardingStepState {
  id: OnboardingStepId;
  status: StepStatus;
  /** Why a reviewer sent it back, in their words. */
  rejectionReason: string | null;
  submittedAtIso: string | null;
}

/** `GET /org/onboarding`, in the shape the wizard reads. */
export interface OnboardingApplication {
  id: string;
  /** The service's own word for where the whole application has got to. */
  status: string;
  steps: OnboardingStepState[];
  /** What was already entered, per step. */
  payloads: Partial<Record<OnboardingStepId, Record<string, unknown>>>;
  documents: UploadedDocument[];
  submittedAtIso: string | null;
}

/** One step's state, or a not-started placeholder for a step the service omits. */
export function stepState(
  application: OnboardingApplication | undefined,
  id: OnboardingStepId,
): OnboardingStepState {
  return (
    application?.steps.find((s) => s.id === id) ?? {
      id,
      status: 'not_started',
      rejectionReason: null,
      submittedAtIso: null,
    }
  );
}

/** A step the applicant may still edit. Submitted and approved steps are locked. */
export function isEditable(status: StepStatus): boolean {
  return status === 'not_started' || status === 'in_progress' || status === 'rejected';
}

/**
 * What a step still needs before it can be sent.
 *
 * Returned as keys rather than sentences so the caller can put them into words —
 * and so this stays testable without a translator.
 */
export function outstandingFor(
  step: OnboardingStepMeta,
  payload: Record<string, unknown>,
  documents: UploadedDocument[],
): { fields: string[]; documents: DocumentId[] } {
  const missingFields = step.fields
    .filter((f) => f.required)
    .filter((f) => !String(payload[f.key] ?? '').trim())
    .map((f) => f.key);

  const held = new Set(documents.map((d) => d.id));
  const missingDocuments = step.documents.filter(
    (id) => DOCUMENT_REQUIREMENTS[id].required && !held.has(id),
  );

  return { fields: missingFields, documents: missingDocuments };
}

/**
 * Whether the whole application can be sent for review.
 *
 * Every step but the last must have been submitted, and every required document
 * attached. The service enforces this too — it refuses a submit with steps
 * outstanding — but a button that can only be refused teaches nothing, so the
 * same answer is computed here to say *what* is missing.
 */
export function readyToSubmit(application: OnboardingApplication | undefined): boolean {
  if (!application) return false;
  const evidenceSteps = ONBOARDING_STEPS.filter((s) => s.id !== 'documents');

  const everyStepSent = evidenceSteps.every((step) => {
    const status = stepState(application, step.id).status;
    return status === 'submitted' || status === 'approved';
  });

  const held = new Set(application.documents.map((d) => d.id));
  const everyDocumentHeld = (Object.keys(DOCUMENT_REQUIREMENTS) as DocumentId[])
    .filter((id) => DOCUMENT_REQUIREMENTS[id].required)
    .every((id) => held.has(id));

  return everyStepSent && everyDocumentHeld;
}
