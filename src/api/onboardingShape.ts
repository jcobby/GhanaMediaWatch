import {
  DOCUMENT_REQUIREMENTS,
  ONBOARDING_STEP_IDS,
  type DocumentId,
  type OnboardingApplication,
  type OnboardingStepId,
  type OnboardingStepState,
  type StepStatus,
  type UploadedDocument,
} from '@/types/onboarding';

/**
 * `GET /org/onboarding`, translated into the shape the wizard reads.
 *
 * **Why a translation exists at all.** The endpoint's declared response is
 * `{ id, orgId, status, steps[], documents[] }` with `additionalProperties: true`
 * — which is to say it declares almost nothing — and what the service actually
 * sends does not match the part it does declare. `steps` is a **map keyed by
 * step id**, not a list, with the answers under `payload` and a sent-back reason
 * under `rejectionNote`. Handed straight to a list-shaped consumer,
 * `steps.find` is not a function and the screen crashes.
 *
 * The console met this first and its note records the payload, observed against
 * the live service on 15 September:
 *
 *     { "id": "onb_…", "orgId": "org_…", "reference": "ONB-ORG-000002",
 *       "steps": { "organisation": { "status": "submitted",
 *                  "payload": { "legalName": "…" }, "updatedAtIso": "…",
 *                  "rejectionNote": null } },
 *       "stepsView": { …every step, including not_started… },
 *       "documents": [{ "id": "business_registration", "fileName": "…",
 *                       "sha256": "…", "uploadedAtIso": "…" }],
 *       "submittedAtIso": null, "approvedAtIso": null, … }
 *
 * `stepsView` lists every step; `steps` only the ones touched. Either may be a
 * map or, from an older build, a list, and all three readings are accepted —
 * the cost of guessing wrong is a wizard that shows an applicant none of the
 * work they have already done.
 *
 * Pure and free of any React Native import, so the tests can feed it that
 * payload directly.
 */

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const STEP_IDS = new Set<string>(ONBOARDING_STEP_IDS);

/**
 * A step status in this app's vocabulary.
 *
 * `accepted` and `returned` are read as well as our own words, because the
 * reviewer's decide endpoint documents no body and that side has not been
 * observed. Anything unrecognised becomes `in_progress` — never `approved`,
 * which would tell an applicant a step passed review when nobody said so.
 */
function statusOf(value: unknown): StepStatus {
  switch (value) {
    case 'not_started':
    case 'in_progress':
    case 'submitted':
    case 'approved':
    case 'rejected':
      return value;
    case 'accepted':
      return 'approved';
    case 'returned':
    case 'sent_back':
      return 'rejected';
    default:
      return 'in_progress';
  }
}

export function normaliseOnboarding(raw: unknown): OnboardingApplication {
  const source: Loose = isRecord(raw) ? raw : {};

  const stepSource = source.stepsView ?? source.steps;
  const entries: [string, Loose][] = Array.isArray(stepSource)
    ? stepSource.filter(isRecord).map((step) => [String(step.id ?? ''), step])
    : isRecord(stepSource)
      ? Object.entries(stepSource).filter((entry): entry is [string, Loose] => isRecord(entry[1]))
      : [];

  const steps: OnboardingStepState[] = [];
  const payloads: OnboardingApplication['payloads'] = {};

  for (const [id, step] of entries) {
    // A step id this app has no screen for has nowhere to be shown.
    if (!STEP_IDS.has(id)) continue;
    const status = statusOf(step.status);
    const sent = status === 'submitted' || status === 'approved' || status === 'rejected';

    steps.push({
      id: id as OnboardingStepId,
      status,
      rejectionReason: text(step.rejectionNote) ?? text(step.rejectionReason),
      submittedAtIso: text(step.submittedAtIso) ?? (sent ? text(step.updatedAtIso) : null),
    });

    if (isRecord(step.payload)) payloads[id as OnboardingStepId] = step.payload;
  }

  const documents: UploadedDocument[] = (Array.isArray(source.documents) ? source.documents : [])
    .filter(isRecord)
    /*
     * A document type this app does not know has no slot to show it in. Dropped
     * rather than rendered raw: `premises_proof_v2` in a list of requirements
     * reads as a requirement nobody can satisfy.
     */
    .filter(
      (document) =>
        typeof document.id === 'string' && document.id in DOCUMENT_REQUIREMENTS,
    )
    .map((document) => ({
      id: document.id as DocumentId,
      fileName: text(document.fileName) ?? '',
      sha256: text(document.sha256) ?? '',
      uploadedAtIso: text(document.uploadedAtIso) ?? text(document.createdAtIso),
    }));

  return {
    id: text(source.id) ?? '',
    status: text(source.status) ?? 'draft',
    steps,
    payloads,
    documents,
    submittedAtIso: text(source.submittedAtIso),
  };
}
