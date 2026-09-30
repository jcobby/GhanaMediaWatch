import {
  BLOGGER_STEPS,
  type BloggerApplication,
  type BloggerStepState,
} from '@/types/bloggerVerification';

/**
 * `GET /me/verification`, translated into the shape the screen reads.
 *
 * **The declared response is almost nothing.** `PersonApplication` gives
 * `steps` as `{ type: 'object', additionalProperties: true }` and `documents`
 * as an array of the same, so the schema promises no field this screen
 * actually needs. What the live service sends, read off a freshly registered
 * blogger on 28 September:
 *
 *     { "id": "pva_a693bc8b4781", "userId": "usr_…", "kind": "blogger",
 *       "reference": "ONB-PER-FB2036", "steps": {}, "documents": [],
 *       "submittedAtIso": null, "approvedAtIso": null,
 *       "rejectionReason": null, "screeningRunAtIso": null,
 *       "screeningClear": null, "createdAtIso": "…", "updatedAtIso": "…",
 *       "missingDocuments": ["officer_id", "utility_bill_or_premises_proof"] }
 *
 * Two things follow. `steps` is a **map keyed by step id**, matching the
 * organisation's application rather than the list its own schema might suggest
 * — so `steps.find` would not be a function. And `missingDocuments` names an
 * *alternative group* (`utility_bill_or_premises_proof`) rather than a document
 * type, so it cannot be read as a list of things to upload without splitting it
 * first.
 *
 * A list is accepted for `steps` as well, because the organisation's equivalent
 * has been seen both ways and the cost of guessing wrong is a screen that shows
 * a blogger none of the work they have already done.
 *
 * Pure, with no React Native import, so tests can feed it that payload directly.
 */

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const STATUSES = ['not_started', 'in_progress', 'submitted', 'approved', 'rejected'] as const;

function statusOf(raw: unknown): BloggerStepState['status'] {
  const value = typeof raw === 'string' ? raw : '';
  return (STATUSES as readonly string[]).includes(value)
    ? (value as BloggerStepState['status'])
    : 'not_started';
}

/**
 * The answers, whichever key they arrive under.
 *
 * The organisation's application nests them under `payload`; a flatter reading
 * would put them at the top of the step. Both are accepted and only strings are
 * kept — every field on these steps is text, and a number or a null reaching a
 * `TextInput` as its value is a crash rather than a blank.
 */
function valuesOf(step: Loose): Record<string, string> {
  const source = isObject(step.payload) ? step.payload : isObject(step.values) ? step.values : step;

  /*
   * An allowlist, not a denylist.
   *
   * When the step arrives flat — no `payload` or `values` wrapper, a shape this
   * function accepts on purpose — `source` is the whole envelope, and stripping
   * four known metadata keys leaves every other one through. `id`, `stepId` and
   * `createdAtIso` became "answers", and because the screen sends
   * `payload: valuesFor(id)` straight back on the next save, the stored
   * application grew fields the reviewer then had to read past.
   *
   * The fields are a closed list in `types/bloggerVerification.ts`, so only
   * those are taken. Anything the service adds later is ignored rather than
   * echoed, which is the safe direction for a document a human reviews.
   */
  const known = new Set(BLOGGER_STEPS.flatMap((step) => step.fields.map((f) => f.key)));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key)) continue;
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number') out[key] = String(value);
  }
  return out;
}

function stepsOf(raw: unknown): Record<string, BloggerStepState> {
  const out: Record<string, BloggerStepState> = {};

  const record = (id: string | null, step: unknown) => {
    if (!id || !isObject(step)) return;
    out[id] = {
      status: statusOf(step.status),
      values: valuesOf(step),
      // The organisation's calls it `rejectionNote`; the person's schema says
      // `rejectionReason`. Either is the reviewer telling them what to fix.
      rejectionReason: str(step.rejectionNote) ?? str(step.rejectionReason),
    };
  };

  if (Array.isArray(raw)) {
    for (const step of raw) record(isObject(step) ? str(step.id) : null, step);
  } else if (isObject(raw)) {
    for (const [id, step] of Object.entries(raw)) record(id, step);
  }

  return out;
}

export function normaliseVerification(raw: unknown): BloggerApplication {
  const root = isObject(raw) ? raw : {};

  /*
   * `stepsView` where it exists, because the organisation's endpoint sends
   * every step under it and only the touched ones under `steps`. Merged rather
   * than chosen: whichever holds more is the fuller picture, and a step present
   * in both should take the one that has been worked on.
   */
  const merged = { ...stepsOf(root.stepsView), ...stepsOf(root.steps) };

  const documents = Array.isArray(root.documents)
    ? root.documents
        .filter(isObject)
        .map((d) => ({ id: str(d.id) ?? str(d.documentType) ?? '', fileName: str(d.fileName) ?? '' }))
        .filter((d) => d.id)
    : [];

  return {
    id: str(root.id) ?? '',
    // Quoted in every email about the application, so a blank one is worth
    // avoiding: the id is a poor substitute but it is better than nothing.
    reference: str(root.reference) ?? str(root.id) ?? '',
    steps: merged,
    documents,
    missingDocuments: Array.isArray(root.missingDocuments)
      ? root.missingDocuments.filter((d): d is string => typeof d === 'string')
      : [],
    submittedAtIso: str(root.submittedAtIso),
    approvedAtIso: str(root.approvedAtIso),
    rejectionReason: str(root.rejectionReason),
    screeningClear: typeof root.screeningClear === 'boolean' ? root.screeningClear : null,
  };
}
