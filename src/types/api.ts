import type { NewsSection } from './sections';
import type { SubmissionDestination } from './dawuro';
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

/**
 * Where a report has got to on the editorial desk.
 *
 * Not a property of the reporter's choice: a report bound for the public feed
 * is `pending_review` until an editor or the platform owner runs it, and only
 * a transition from that desk makes it `published`.
 */
export type VettingState = 'pending_review' | 'published' | 'rejected' | 'restricted';

/** Enumerated so every state can be checked for words, an icon and a colour. */
export const VETTING_STATES: readonly VettingState[] = [
  'pending_review',
  'published',
  'rejected',
  'restricted',
];

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
  /**
   * Pixel dimensions, when the server worked them out.
   *
   * Nullable because they are null in practice — verified against the live
   * service, a freshly uploaded clip comes back `"width":null,"height":null`
   * while older ones carry 1080×1920. Declared as required numbers, that made
   * every consumer believe in a number that was not there.
   */
  width: number | null;
  height: number | null;
  durationMs?: number;
  byteSize?: number;
  /**
   * The container the server holds, as it describes it.
   *
   * On the wire and previously undeclared. It decides the extension a
   * downloaded copy is saved under, which is how a player picks its parser —
   * the signed media URL has no extension of its own. `video/quicktime` is the
   * common case here: this app records QuickTime on iOS.
   */
  mimeType?: string;
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
 * organisation at all.
 *
 * The reporter is still the author; the organisation is the publisher. Those
 * are different roles and the model keeps them apart.
 */
/**
 * The person who filed the report.
 *
 * Two cases only — a named account or an anonymous one. An organisation is
 * never a reporter: institutions publish, people film.
 */
export type Reporter =
  | { kind: 'anonymous' }
  | { kind: 'user'; id: string; displayName: string; avatarUrl: string | null };

export type Publisher =
  | Reporter
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

/**
 * Where a feed item came from.
 *
 * `citizen_report` is the product: someone filmed it, the GPS gate passed, the
 * trust model applies and the reporter earns if an institution licenses it.
 *
 * `newsroom` is the agency's own copy — wire and desk-written stories. It fills
 * the desks a citizen cannot, and it is deliberately outside the trust model
 * rather than exempted from it: there is no capture to assure, no location to
 * verify, and nobody to pay.
 */
export type ItemOrigin = 'citizen_report' | 'newsroom';

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
  /**
   * Whether a person filmed this, or a newsroom wrote it.
   *
   * The feed carries both. Six desks — Ghana, Africa, World, Business,
   * Politics, Sport — and only one of them can be filled by citizens standing
   * in front of something in Accra. The other five are the agency's own copy,
   * which is a different kind of thing and has to say so.
   *
   * Before this field existed the wire stories were dressed as incident
   * reports: an ECOWAS summit carried a GPS fix in Abuja, a named citizen
   * reporter who had supposedly filmed it, and a "Captured 11:17 AM" stamp.
   * That is not a cosmetic problem. The whole product rests on a reader being
   * able to believe a report was captured where and when it says, and on a
   * reporter being paid when their footage is used — and the disguise quietly
   * broke both.
   *
   * A `newsroom` item therefore claims none of it: no capture stamp, no
   * assurance class, no reporter credit, and no commission. See §14.
   */
  origin: ItemOrigin;
  category: IncidentCategory;
  /**
   * The news desk this ran on.
   *
   * Separate from `category`: the category is what was filed and what routing,
   * commission and the editorial queue all key off. The desk is where an
   * editor published it. A burst main in Kaneshie is a `flood` on the Ghana
   * desk.
   */
  section: NewsSection;
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
  /**
   * Who filed it, always — even when an organisation is the publisher.
   *
   * `publisher` alone cannot carry this. It is a union, so the moment an
   * institution releases a report the reporter's name is gone from the payload,
   * and the feed reads as though the institution filmed it. The credit belongs
   * to the person who stood there.
   *
   * When `publisher.kind` is `user` or `anonymous` this is the same party, and
   * the interface shows it once.
   */
  reporter: Reporter;
  counts: IncidentCounts;
  viewerHasReacted: boolean;
  /** Metres from the viewer. Present only when the query passed `near`. */
  distanceM?: number;
}

/** The author's own view — adds everything the public must not see. */
export interface AuthoredIncident extends Omit<Incident, 'location' | 'publishedAt'> {
  location: PreciseLocation;
  displayFlags: DisplayFlags;
  isAnonymous: boolean;
  rejectionReason: string | null;
  /** Mirrors the client's local row id so the outbox can reconcile. */
  clientId: string;
  /**
   * Where the reporter asked for it to go.
   *
   * The one field that decides what the app may promise them. A `public`
   * submission is reviewed by an editor and released to the feed; it is never
   * offered to an institution. A `directed` one is the opposite. The app used
   * to infer this from an empty recipients list, which reads "public" for a
   * directed report the desk has not routed yet and for one whose outcome
   * simply has not loaded — so it told reporters their report had gone to the
   * public feed when it had gone nowhere.
   *
   * Verified present on `GET /me/incidents`.
   */
  destination: SubmissionDestination;
  /** Institutions named on a `directed` submission. Empty otherwise. */
  requestedBusinessIds: string[];
  /** When it was filed. */
  createdAt: string;
  /**
   * When an editor released it, or null.
   *
   * Narrowed from `Incident`, where it is a plain string because the public
   * feed only ever carries published reports. On the author's own list — the
   * one screen that shows reports *before* they are published — it is null for
   * every report still in review, which is most of them. Declared as a string
   * it rendered as a blank timestamp on the report tile and an undated "You
   * filed this" at the top of the outcome timeline.
   */
  publishedAt: string | null;
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
  /** Repeatable. OR within, AND with `category`. */
  section?: NewsSection[];
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
  /**
   * Client-side only: a guest reached something that needs an account.
   *
   * The server says FORBIDDEN, which is true but unhelpful — it is the same
   * code it returns to a signed-in reporter who lacks a permission, and those
   * two people need opposite advice. Narrowed in the HTTP client so the copy
   * can say "make an account" rather than "ask your administrator".
   */
  | 'SIGN_IN_REQUIRED'
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
