/**
 * The API contract as TypeScript.
 *
 * This file is the single source of truth for every shape crossing the network
 * boundary, and it mirrors API_CONTRACT.md exactly. If the two disagree, the
 * document is what the backend engineer builds against — fix both together.
 *
 * Enumerations are closed unions on purpose: adding a server-side value without
 * shipping the client first is a breaking change, and this makes that a compile
 * error rather than a runtime surprise.
 */

// ─── enumerations ──────────────────────────────────────────────────────────

export const INCIDENT_CATEGORIES = [
  'fire',
  'accident',
  'disorder',
  'infrastructure',
  'utility',
  'corruption',
  'environment',
  'wildlife',
  'flood',
  'crime',
  'health',
  'other',
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export type VettingState = 'pending_review' | 'published' | 'rejected' | 'restricted';

/**
 * What was captured.
 *
 * Audio is a first-class report type, not a lesser one: describing an incident
 * from somewhere safe carries none of the risk of filming it, and it is the
 * only mode that works in the dark or in a crowd.
 */
export type MediaKind = 'photo' | 'video' | 'audio';

/** `low` means the reporter used the reduced-accuracy escape hatch at capture. */
export type LocationConfidence = 'high' | 'low';

/**
 * How much of the capture timestamp the reporter allowed to be published.
 *
 * This is explicit rather than inferred, and that matters: when `showTime` is
 * false the server truncates to midnight UTC, and a client inferring precision
 * from the value alone cannot tell a suppressed time from an incident that
 * genuinely happened at 00:00. Guessing there would either leak a real midnight
 * capture or mislabel a hidden one.
 */
export type TimePrecision = 'exact' | 'date_only' | 'hidden';

// ─── media ─────────────────────────────────────────────────────────────────

export interface IncidentMedia {
  kind: MediaKind;
  url: string;
  /** Still frame for video; the client shows it while the player warms up. */
  posterUrl: string;
  width: number;
  height: number;
  durationMs?: number;
  byteSize?: number;
}

// ─── location ──────────────────────────────────────────────────────────────

/**
 * Public location. Every field is nullable because `showLocation: false`
 * suppresses them server-side — the client must never assume they are present.
 */
export interface PublicLocation {
  latitude: number | null;
  longitude: number | null;
  /** Human-readable place, e.g. "Kaneshie, Accra". */
  label: string | null;
  confidence: LocationConfidence;
}

/** Full precision. Author-only — never returned on a public endpoint. */
export interface PreciseLocation extends PublicLocation {
  accuracyM: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  isMocked: boolean;
}

// ─── publisher ─────────────────────────────────────────────────────────────

/**
 * Who a report is credited to on the public feed.
 *
 * `organisation` is the third case and the one the product turns on: an
 * institution licenses a report and may then release it publicly under its own
 * name. That is the difference between a feed of strangers' clips and a feed a
 * newsroom stands behind — and it is why a report can be traced back to a
 * business at all.
 *
 * The reporter is still the author; the organisation is the publisher. Those
 * are different roles and the model keeps them apart.
 */
export type Publisher =
  | { kind: 'anonymous' }
  | { kind: 'user'; id: string; displayName: string; avatarUrl: string | null }
  | {
      kind: 'organisation';
      id: string;
      displayName: string;
      /** Set once a platform administrator has verified the institution. */
      verified: boolean;
      logoUrl: string | null;
    };

// ─── display flags ─────────────────────────────────────────────────────────

/**
 * Set by the reporter at review time, editable later by the account owner.
 *
 * These are DISPLAY flags, not storage flags — the server keeps the true values
 * for vetting and lawful process, but must null them out on public responses.
 * The client enforces the same rules independently. Both layers are required:
 * client-only hiding leaks coordinates into every phone's cache, server-only
 * hiding breaks the moment one client has a bug.
 */
export interface DisplayFlags {
  showLocation: boolean;
  showDate: boolean;
  showTime: boolean;
}

// ─── incident ──────────────────────────────────────────────────────────────

export interface IncidentCounts {
  reactions: number;
  comments: number;
}

/** What the feed, map and public detail endpoints return. */
export interface Incident {
  id: string;
  /**
   * The short reference stamped on the footage and quoted afterwards.
   *
   * Distinct from `id`: `id` is for machines, `reportId` is what someone reads
   * down a phone line and what a stranger types into the public verification
   * page to check the claim.
   */
  reportId: string;
  category: IncidentCategory;
  description: string;
  vettingState: VettingState;
  publishedAt: string;
  media: IncidentMedia;
  location: PublicLocation;
  /** Null when `showDate` is false; truncated to midnight when `showTime` is. */
  capturedAtIso: string | null;
  /** What the client is allowed to render from `capturedAtIso`. See TimePrecision. */
  capturedAtPrecision: TimePrecision;
  publisher: Publisher;
  counts: IncidentCounts;
  viewerHasReacted: boolean;
  /** Metres from the viewer. Present only when the query passed `near`. */
  distanceM?: number;
}

/** The author's own view — adds everything the public must not see. */
export interface AuthoredIncident extends Omit<Incident, 'location'> {
  location: PreciseLocation;
  displayFlags: DisplayFlags;
  isAnonymous: boolean;
  rejectionReason: string | null;
  /** Mirrors the client's local row id so the outbox can reconcile. */
  clientId: string;
}

// ─── pagination ────────────────────────────────────────────────────────────

/** Cursor-based. Offsets would duplicate and skip as reports clear review. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FeedQuery {
  limit?: number;
  cursor?: string;
  category?: IncidentCategory[];
  near?: { latitude: number; longitude: number };
  radiusM?: number;
  since?: string;
  until?: string;
  sort?: 'recent' | 'nearby';
}

// ─── errors ────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'FORBIDDEN'
  | 'INCIDENT_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UPLOAD_EXPIRED'
  | 'MEDIA_TOO_LARGE'
  | 'GPS_ACCURACY_REJECTED'
  | 'MEDIA_HASH_MISMATCH'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'MAINTENANCE'
  | 'NETWORK_UNAVAILABLE';

/**
 * Typed error thrown by every ApiClient implementation.
 *
 * `retryable` is what the outbox switches on — returning a non-retryable code
 * for a transient failure strands a report, and a retryable code for a
 * permanent one makes the device retry hourly forever.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(init: {
    code: ApiErrorCode;
    status: number;
    message: string;
    retryable?: boolean;
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.retryable = init.retryable ?? RETRYABLE_CODES.has(init.code);
  }
}

const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  'RATE_LIMITED',
  'INTERNAL',
  'MAINTENANCE',
  'NETWORK_UNAVAILABLE',
]);
