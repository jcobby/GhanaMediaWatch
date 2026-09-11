import type { AuthoredIncident, FeedQuery, Incident, IncidentCategory, Page } from '@/types/api';
import type { ReportOutcome } from '@/types/outcome';
import type {
  CommissionEntry,
  DirectoryOrganisation,
  EarningsSummary,
  Survey,
} from '@/types/dawuro';

/**
 * The single boundary between the app and the network.
 *
 * Every screen depends on this interface and nothing below it. Two
 * implementations satisfy it — `HttpApiClient` against the real backend and
 * `MockApiClient` against seeded fixtures — so the app runs end to end whether
 * or not a server is reachable, and swapping between them is one env var.
 *
 * No component constructs a request inline. When the contract changes, it
 * changes here and in the two implementations, not across thirty screens.
 */

export interface MapCluster {
  latitude: number;
  longitude: number;
  count: number;
  categories: IncidentCategory[];
}

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  category: IncidentCategory;
}

export interface MapData {
  clusters: MapCluster[];
  markers: MapMarker[];
}

export interface MapQuery {
  /** `west,south,east,north` */
  bbox?: string;
  zoom?: number;
  category?: IncidentCategory[];
}

export interface DeviceRegistration {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  platformDeviceId: string | null;
  appVersion: string;
  buildNumber: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  /**
   * When the refresh token itself dies.
   *
   * Distinct from `expiresAt`, which is the short-lived access token. Without
   * it the app cannot tell "my access token needs refreshing" from "the user
   * must sign in again", and would loop on a refresh that can never succeed.
   */
  refreshExpiresAt?: string;
  /**
   * Which kind of caller this token speaks for.
   *
   * A device token is issued to the phone with nobody signed in, and the server
   * refuses the `/me/*` endpoints for it — so "my reports", earnings and
   * commissions all answer 403 for a guest. Without knowing the kind, the app
   * reads that 403 as a permissions problem and tells the reporter to contact
   * their organisation's administrator, which for a guest is advice about an
   * organisation they do not have.
   *
   * Defaults to `device` where it is absent, which is what an install upgraded
   * from a build that did not record it is holding.
   */
  kind?: 'device' | 'user';
}

export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * Creating an account.
 *
 * Separate from signing in, which it was not before: the app used a
 * create-on-first-signin endpoint, so anyone who mistyped their email at the
 * sign-in box silently got a brand new empty account instead of an error.
 */
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

/**
 * What the service says about the signed-in account.
 *
 * `GET /me`. The one endpoint that can answer "does this person operate an
 * organisation" without already knowing which organisation — which is why
 * membership is read from here rather than inferred from whether an
 * organisation endpoint refused the caller.
 */
export interface Caller {
  userId: string | null;
  /** The account's default organisation, or null for a plain reporter. */
  orgId: string | null;
  role: string | null;
  memberships: { orgId: string; role?: string; name?: string }[];
}

export interface OrgDashboard {
  byCategory: { category: IncidentCategory; count: number }[];
  byState: { state: string; count: number }[];
  trend: { date: string; count: number }[];
  highPriority: Incident[];
}

export interface CreateIncidentRequest {
  clientId: string;
  category: IncidentCategory;
  description: string;
  isAnonymous: boolean;
  displayFlags: { showLocation: boolean; showDate: boolean; showTime: boolean };
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracyM: number;
    /*
     * Optional, never null.
     *
     * The wire contract makes these three optional and not nullable, and the
     * server rejects an explicit null with `Expected number, received null`.
     * Typed to match, so a null can no longer be written here by accident —
     * which is how every submission from a stationary phone (no heading, no
     * speed) came to fail validation.
     */
    altitude?: number;
    heading?: number;
    speed?: number;
    confidence: 'high' | 'low';
    isMocked: boolean;
  };
  capturedAtIso: string;
  capturedAtUtcOffsetMinutes: number;
  deviceUptimeMs: number;
  media: {
    kind: 'photo' | 'video';
    mimeType: string;
    byteSize: number;
    durationMs?: number;
    width?: number;
    height?: number;
    sha256: string;
  };
}

export interface CreateIncidentResponse {
  incidentId: string;
  uploadId: string;
  /** Authoritative — the client uses whatever the server returns, not its own. */
  chunkSizeBytes: number;
  chunkCount: number;
  expiresAt: string;
}

export interface UploadStatus {
  uploadId: string;
  chunkSizeBytes: number;
  chunkCount: number;
  /** Indices already held, so an interrupted upload resumes. */
  receivedChunks: number[];
  expiresAt: string;
}

export interface ApiClient {
  /**
   * Phase 1 of the upload: metadata only, no bytes.
   * `idempotencyKey` makes a replayed submission return the original response
   * rather than creating a duplicate report.
   */
  createIncident(
    input: CreateIncidentRequest,
    idempotencyKey: string,
  ): Promise<CreateIncidentResponse>;

  /** Phase 2: raw bytes. Idempotent — re-sending a held chunk is a no-op. */
  putChunk(uploadId: string, index: number, bytes: Uint8Array): Promise<void>;

  /** Phase 3: assemble and verify the hash. */
  completeUpload(uploadId: string): Promise<{ incidentId: string }>;

  /** Resumption: which chunks the server already holds. */
  getUploadStatus(uploadId: string): Promise<UploadStatus>;

  /** Bootstraps an anonymous device identity. Called once on first launch. */
  registerDevice(input: DeviceRegistration): Promise<AuthTokens>;

  signIn(input: SignInRequest): Promise<AuthTokens>;

  register(input: RegisterRequest): Promise<AuthTokens>;

  /**
   * Exchange a refresh token for a fresh access token.
   *
   * The alternative to this is what the app used to do when a signed-in token
   * expired: register a *device*, which silently turns an account back into a
   * guest without anybody being told.
   */
  refresh(refreshToken: string): Promise<AuthTokens>;

  /** Published incidents only. The server never returns other states here. */
  getFeed(query?: FeedQuery): Promise<Page<Incident>>;

  getIncident(id: string): Promise<Incident>;

  /** Clustered server-side; returning raw points would not hold 60fps. */
  getMapData(query?: MapQuery): Promise<MapData>;

  /** The caller's own reports, across every vetting state. */
  getMyIncidents(): Promise<Page<AuthoredIncident>>;

  /**
   * Withdraw one of your own reports.
   *
   * `DELETE /incidents/{id}` — **author-only, and a soft delete.** Only the
   * account that filed a report can remove it: an editor cannot, a platform
   * owner cannot, and neither can anyone the report was routed to. That is the
   * right shape for it. A reporter filmed the thing, often at some risk, and
   * withdrawing it is their decision — while an institution being able to
   * delete footage about itself is the failure the whole platform exists to
   * prevent.
   *
   * Soft, so the record survives for lawful process and for any organisation
   * that has already licensed it. This is a reporter taking it down, not the
   * evidence ceasing to exist.
   */
  deleteIncident(incidentId: string): Promise<void>;

  /**
   * What institutions have done about one of the reporter's own reports.
   *
   * Author-only: it names organisations and quotes what they said, which is the
   * reporter's organisation and nobody else's.
   */
  getReportResponses(incidentId: string): Promise<ReportOutcome>;

  /** What the reporter has earned and what is still owed. */
  getEarnings(): Promise<EarningsSummary>;

  /** The ledger behind that total, newest first. */
  getCommissions(): Promise<CommissionEntry[]>;

  /**
   * The public directory of organisations on the platform.
   *
   * Needed wherever a reporter is asked to choose who receives a report. It has
   * to come from the server: offering a list of organisations that do not exist
   * takes a decision from somebody about where their footage goes, and then
   * sends it nowhere.
   */
  /**
   * The public organisation directory.
   *
   * `DirectoryOrganisation`, not `OrganisationAccount`: `GET /organisations` sends
   * id, name, sector, verified, logo and two counts, and nothing about billing,
   * tier or declared interests. Typing it as the full record made all of those
   * silently `undefined` — and the capture screen filtered on one of them, so
   * every organisation was dropped and reporters were told "No buyers yet"
   * permanently.
   */
  getOrganisations(): Promise<DirectoryOrganisation[]>;

  /** Paid questions this reporter is eligible to answer. */
  getSurveys(): Promise<Survey[]>;

  /**
   * Submit a completed survey.
   *
   * The reward is credited by the server, so this must actually reach it — a
   * simulated submission tells somebody they have earned money that nothing
   * has recorded.
   */
  submitSurveyResponse(surveyId: string, answers: Record<string, unknown>): Promise<void>;

  /** Who the caller is, and which organisation they belong to. */
  getCaller(): Promise<Caller>;

  /** Scoped by `orgId`, which the service requires as a header on org routes. */
  getOrgDashboard(orgId: string): Promise<OrgDashboard>;
}
