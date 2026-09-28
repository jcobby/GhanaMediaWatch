/**
 * What a blogger has to show to publish under a checked byline.
 *
 * **The step set lives here, not on the server.** `PUT /me/verification/steps/
 * {stepId}` takes any string for `stepId` and stores whatever object it is
 * given — `PersonApplication.steps` is an open map, and a freshly registered
 * blogger comes back with `steps: {}`. So this file is the definition, and the
 * screen, the outstanding list and the reviewer's expectations all read from
 * it rather than from three separate ideas of what a blogger must provide.
 *
 * **Three steps, not the organisation's four.** A blogger is one person: there
 * is no legal entity to register, no authorised officer to appoint on behalf of
 * anyone, and no premises. Asking for a certificate of incorporation would be
 * asking a person to prove they are a company, which they are not — and it is
 * the shortcut that would follow from modelling a blogger as a one-person
 * organisation.
 *
 * The documents are the service's own three (`officer_id`, `utility_bill`,
 * `premises_proof`) and no new type was needed: a Ghana Card is `officer_id`
 * whether it belongs to a company officer or to a blogger, and either of the
 * other two proves an address.
 */

export const BLOGGER_STEP_IDS = ['identity', 'presence', 'coverage'] as const;
export type BloggerStepId = (typeof BLOGGER_STEP_IDS)[number];

/** The three the service accepts on `/me/verification/documents`. */
export const BLOGGER_DOCUMENT_IDS = ['officer_id', 'utility_bill', 'premises_proof'] as const;
export type BloggerDocumentId = (typeof BLOGGER_DOCUMENT_IDS)[number];

export interface BloggerField {
  key: string;
  /** Whether the step can be sent without it. */
  required: boolean;
  /** Free text unless this says otherwise — it changes the keyboard, nothing more. */
  keyboard?: 'default' | 'phone' | 'url';
  /** Several lines rather than one, for anything that is a description. */
  multiline?: boolean;
}

export interface BloggerStep {
  id: BloggerStepId;
  fields: BloggerField[];
  /**
   * Documents this step needs before it can be sent.
   *
   * An `alternativeGroup` on a requirement below means any one member
   * satisfies it, so a step naming both is satisfied by either.
   */
  documents: BloggerDocumentId[];
}

export const BLOGGER_STEPS: BloggerStep[] = [
  {
    id: 'identity',
    fields: [
      { key: 'legalName', required: true },
      { key: 'idNumber', required: true },
      { key: 'phone', required: true, keyboard: 'phone' },
    ],
    documents: ['officer_id'],
  },
  {
    /*
     * Where they already publish, which is the substance of the check.
     *
     * A platform owner approving a blogger is deciding whether this person is
     * who they say they are *and* whether they are actually a publisher. The
     * first is the Ghana Card; the second is this, and without it approval
     * would rest on an ID card alone.
     */
    id: 'presence',
    fields: [
      { key: 'publicationName', required: true },
      { key: 'url', required: true, keyboard: 'url' },
      { key: 'audience', required: false },
      { key: 'about', required: false, multiline: true },
    ],
    documents: [],
  },
  {
    id: 'coverage',
    fields: [
      { key: 'city', required: true },
      { key: 'areaLabel', required: false },
    ],
    // Either proves an address; the service's `missingDocuments` names the
    // pair as `utility_bill_or_premises_proof` for exactly this reason.
    documents: ['utility_bill', 'premises_proof'],
  },
];

export interface BloggerDocumentRequirement {
  id: BloggerDocumentId;
  /** Any one member of a group satisfies the requirement. */
  alternativeGroup?: string;
}

export const BLOGGER_DOCUMENTS: Record<BloggerDocumentId, BloggerDocumentRequirement> = {
  officer_id: { id: 'officer_id' },
  utility_bill: { id: 'utility_bill', alternativeGroup: 'address' },
  premises_proof: { id: 'premises_proof', alternativeGroup: 'address' },
};

/** A step's answers as the service holds them, plus whether it has been sent. */
export interface BloggerStepState {
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
  values: Record<string, string>;
  rejectionReason: string | null;
}

export interface BloggerApplication {
  id: string;
  reference: string;
  steps: Record<string, BloggerStepState>;
  documents: { id: string; fileName: string }[];
  /** The service's own list, which may name an alternative group rather than a type. */
  missingDocuments: string[];
  submittedAtIso: string | null;
  approvedAtIso: string | null;
  rejectionReason: string | null;
  screeningClear: boolean | null;
}

export function stepState(application: BloggerApplication, id: BloggerStepId): BloggerStepState {
  return (
    application.steps[id] ?? { status: 'not_started', values: {}, rejectionReason: null }
  );
}

/** Whether a document, or any acceptable substitute for it, is attached. */
export function documentSatisfied(
  application: BloggerApplication,
  id: BloggerDocumentId,
): boolean {
  const held = new Set(application.documents.map((d) => d.id));
  if (held.has(id)) return true;

  const group = BLOGGER_DOCUMENTS[id].alternativeGroup;
  if (!group) return false;

  return BLOGGER_DOCUMENT_IDS.some(
    (other) => BLOGGER_DOCUMENTS[other].alternativeGroup === group && held.has(other),
  );
}

/**
 * What a step is still missing, as field keys and document ids.
 *
 * Returned rather than a boolean so the screen can name the thing that is
 * missing. "Complete this step" on a form with nine inputs is a puzzle.
 */
export function outstandingFor(
  application: BloggerApplication,
  id: BloggerStepId,
): { fields: string[]; documents: BloggerDocumentId[] } {
  const meta = BLOGGER_STEPS.find((s) => s.id === id)!;
  const values = stepState(application, id).values;

  return {
    fields: meta.fields
      .filter((f) => f.required && !(values[f.key] ?? '').trim())
      .map((f) => f.key),
    /*
     * Deduplicated by group, so an address requirement is one outstanding item
     * rather than two. Listing "utility bill" and "proof of premises"
     * separately reads as two things to find when either will do.
     */
    documents: meta.documents.filter((d, i) => {
      if (documentSatisfied(application, d)) return false;
      const group = BLOGGER_DOCUMENTS[d].alternativeGroup;
      if (!group) return true;
      return meta.documents.findIndex((o) => BLOGGER_DOCUMENTS[o].alternativeGroup === group) === i;
    }),
  };
}

/**
 * Whether the whole application can be sent.
 *
 * Every step complete and every document attached. Deliberately not "every step
 * approved": approval is the reviewer's job and comes after submission, and a
 * client that waited for it would never let anybody submit at all.
 */
export function readyToSubmit(application: BloggerApplication): boolean {
  if (application.submittedAtIso) return false;
  return BLOGGER_STEPS.every((step) => {
    const out = outstandingFor(application, step.id);
    return out.fields.length === 0 && out.documents.length === 0;
  });
}
