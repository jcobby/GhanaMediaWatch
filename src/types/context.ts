/**
 * MUST stay identical to packages/core in the console repo.
 *
 * What a reporter tells us about the thing they filmed.
 *
 * Everything here is the reporter's own account rather than a measurement, and
 * the platform treats it that way — a severity of "emergency" is a claim about
 * urgency, not a dispatch. That distinction matters more than it sounds: the
 * proposal is explicit that immediate danger belongs on official emergency
 * channels, and a product that quietly accepts "emergency" without saying so
 * invites someone to film instead of calling for help.
 */

// ─── severity ──────────────────────────────────────────────────────────────

export type Severity = 'observation' | 'concern' | 'urgent' | 'emergency';

export interface SeverityMeta {
  label: string;
  hint: string;
  hue: string;
  /**
   * Whether the reporter must be told to contact emergency services.
   *
   * Dawuro is not an emergency service and must never be mistaken for one.
   * Anything at this level shows the warning before the report can be sent.
   */
  warnUseEmergencyServices: boolean;
  /** Ranking for queues, higher is more urgent. */
  weight: number;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  observation: {
    label: 'Observation',
    hint: 'Worth recording. Nobody is at risk.',
    hue: '#475569',
    warnUseEmergencyServices: false,
    weight: 1,
  },
  concern: {
    label: 'Concern',
    hint: 'Should be looked at. Getting worse if ignored.',
    hue: '#1D4ED8',
    warnUseEmergencyServices: false,
    weight: 2,
  },
  urgent: {
    label: 'Urgent',
    hint: 'Needs attention today. Property or services affected.',
    hue: '#A25C00',
    warnUseEmergencyServices: false,
    weight: 3,
  },
  emergency: {
    label: 'Emergency',
    hint: 'People are in danger right now.',
    hue: '#C1121F',
    warnUseEmergencyServices: true,
    weight: 4,
  },
};

export const SEVERITIES: Severity[] = ['observation', 'concern', 'urgent', 'emergency'];

/** Ghana's emergency number, shown alongside the warning. */
export const EMERGENCY_NUMBER = '112';

export function warnsAboutEmergencyServices(severity: Severity): boolean {
  return SEVERITY_META[severity].warnUseEmergencyServices;
}

// ─── consent and sensitivity ───────────────────────────────────────────────

/**
 * What the footage contains, as the reporter describes it.
 *
 * These drive handling rather than sorting. Something containing minors cannot
 * be published without redaction no matter how well corroborated it is, and
 * encoding that here means no screen has to remember it.
 */
export interface ConsentFlags {
  /** Identifiable people who agreed to be filmed. */
  subjectsConsented: boolean;
  /** A public place, where consent is not ordinarily required. */
  publicPlace: boolean;
  /** Children are identifiable in the footage. */
  containsMinors: boolean;
  /** Injury, death or otherwise distressing to view. */
  distressing: boolean;
  /** Shows a private home, its interior or its entrance. */
  showsPrivateProperty: boolean;
}

export const EMPTY_CONSENT: ConsentFlags = {
  subjectsConsented: false,
  publicPlace: false,
  containsMinors: false,
  distressing: false,
  showsPrivateProperty: false,
};

export type HandlingRequirement =
  | 'redact_before_publication'
  | 'viewer_warning'
  | 'restrict_location'
  | 'editorial_review_required';

/**
 * What must happen to this footage before anyone sees it.
 *
 * Derived rather than chosen. A reporter ticking "there are children in it" is
 * describing the footage; deciding that it therefore cannot be published
 * unredacted is the platform's job, not theirs.
 */
export function handlingRequirements(consent: ConsentFlags): HandlingRequirement[] {
  const required: HandlingRequirement[] = [];

  if (consent.containsMinors) {
    required.push('redact_before_publication', 'editorial_review_required');
  }
  if (consent.distressing) {
    required.push('viewer_warning', 'editorial_review_required');
  }
  if (consent.showsPrivateProperty) {
    required.push('restrict_location');
    // Identifiable people at a private address who did not agree to be filmed
    // are the case most likely to cause real harm.
    if (!consent.subjectsConsented && !consent.publicPlace) {
      required.push('redact_before_publication');
    }
  }

  return [...new Set(required)];
}

/** True when the footage cannot go public without redaction first. */
export function needsRedaction(consent: ConsentFlags): boolean {
  return handlingRequirements(consent).includes('redact_before_publication');
}

/** True when a human must look at it regardless of automated checks. */
export function needsEditorialReview(consent: ConsentFlags): boolean {
  return handlingRequirements(consent).includes('editorial_review_required');
}

// ─── the whole context block ───────────────────────────────────────────────

export interface IncidentContext {
  /** A nearby name people actually use, when coordinates are not enough. */
  landmark: string | null;
  severity: Severity;
  consent: ConsentFlags;
  /** What the reporter wants done about it. */
  requestedAction: string | null;
  /** People or assets visible, for institutional follow-up. */
  observedSubjects: string | null;
}

export const EMPTY_CONTEXT: IncidentContext = {
  landmark: null,
  severity: 'concern',
  consent: EMPTY_CONSENT,
  requestedAction: null,
  observedSubjects: null,
};

// ─── report identity ───────────────────────────────────────────────────────

/**
 * The human-readable reference stamped on the footage and quoted everywhere
 * afterwards.
 *
 * Deliberately short and unambiguous when read aloud down a phone line.
 *
 * The alphabet excludes every vowel, so an id can never spell a word — nobody
 * has to read an unfortunate code back to a call centre. It also drops the
 * pairs people confuse in a low-resolution overlay burned into video: 0/O,
 * 1/I/L, 2/Z, 5/S and 8/B.
 */
const ID_ALPHABET = '34679CDFGHJKMNPQRTVWXY';

export function formatReportId(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let value = hash >>> 0;
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ID_ALPHABET[value % ID_ALPHABET.length];
    value = Math.floor(value / ID_ALPHABET.length);
  }
  return `DW-${out.slice(0, 3)}-${out.slice(3)}`;
}
