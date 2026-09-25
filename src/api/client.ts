import type { AuthoredIncident, FeedQuery, Incident, IncidentCategory, Page } from '@/types/api';
import type { ReportOutcome } from '@/types/outcome';
import type {
  CommissionEntry,
  DirectoryOrganisation,
  EarningsSummary,
  OrganisationSector,
  Survey,
} from '@/types/dawuro';
import type {
  DocumentId,
  OnboardingApplication,
  OnboardingStepId,
} from '@/types/onboarding';
import type {
  LicenceResult,
  OrgAssignment,
  OrgDashboard,
  OrgInboxItem,
  OrgIncidentStatus,
  OrgMember,
  OrgResponseAction,
  PublicationRequest,
} from '@/types/org';

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
  /**
   * `west,south,east,north` — **required by the service.**
   *
   * Optional here once, which made it possible to build a request the service
   * refuses: `GET /incidents/map` declares `bbox` required and answers 400
   * without it. Nothing called this, so it never surfaced — but an optional
   * field for a mandatory parameter is a trap set for whoever wires the
   * clustered map, and the type is the cheapest place to close it.
   */
  bbox: string;
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
  /**
   * What kind of account to create. Omitted means a reporter.
   *
   * `organisation` also creates a **pending** organisation and an owner
   * membership, so `/org/onboarding/*` works immediately with the scope header.
   * Until a platform administrator approves it, that is the only thing the
   * account may reach — every other `/org/*` route answers
   * `403 check: "org_pending"`.
   */
  accountKind?: 'user' | 'organisation';
  /** Required when `accountKind` is `organisation`. Sector defaults to `other`. */
  organisation?: { name: string; sector?: OrganisationSector };
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
  /**
   * `verified` is how `/me` says whether the platform has approved the
   * organisation. It is false for an applicant part-way through onboarding, and
   * the service then refuses every `/org/*` route but onboarding itself with
   * `check: "org_pending"` — so a client that ignores it opens an inbox that can
   * only render refusals, on an account with nothing wrong with it.
   */
  memberships: { orgId: string; role?: string; name?: string; verified?: boolean }[];
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
    /**
     * The millisecond of the clip the reporter picked as its thumbnail.
     *
     * The service cuts `posterUrl` at this point; absent means one second, which
     * often catches the phone still being raised. Only ever sent for video.
     */
    posterAtMs?: number;
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
   * Exchange a Google identity for Dawuro tokens. Registers on first use.
   *
   * `POST /auth/google`. There is no separate "sign up with Google": the
   * service creates the account if the address is new and signs it in if it is
   * not, which is the behaviour people expect from the button and the reason it
   * can sit on both screens.
   *
   * **The `idToken` is the credential and is always sent.** The endpoint's
   * schema marks every field optional, which would make a request carrying only
   * an email a way to mint a session for an address you do not own — the same
   * hole `POST /auth/signin` has and which nothing in this app is allowed to
   * use. Whether the service verifies the token against Google is the service's
   * business, but the client must never give it the option of not having one.
   *
   * `kind` and `orgId` are in the schema and are deliberately not sent. They
   * name the role and the organisation, and a client that could choose those
   * would be granting itself an account type — which is the exact thing the
   * seeded-login sign-in used to do here.
   */
  signInWithGoogle(input: {
    idToken: string;
    email: string;
    displayName: string;
  }): Promise<AuthTokens>;

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

  /**
   * Clustered server-side; returning raw points would not hold 60fps.
   *
   * Unused today — the map screen plots the published feed instead, because the
   * card that opens on tap needs a description and a capture time that clustered
   * points do not carry. Kept for the density problem it exists to solve.
   */
  getMapData(query: MapQuery): Promise<MapData>;

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

  /** Published reports credited to one organisation — its own homepage feed. */
  getOrganisationIncidents(organisationId: string): Promise<Incident[]>;

  /** Surveys an organisation is running, for its homepage. Public. */
  getOrganisationSurveys(organisationId: string): Promise<Survey[]>;

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

  /**
   * Comments under a report, oldest first.
   *
   * Read from the server so everyone sees the same discussion. They were a
   * store on the phone seeded from fixtures, so a comment was visible only to
   * the person who wrote it, on the phone they wrote it on.
   */
  getComments(incidentId: string): Promise<import('@/types/comments').IncidentComment[]>;

  /**
   * Post a comment, optionally without your name on it.
   *
   * `isAnonymous` is sent to the service, which decides what the author looks
   * like to everybody else — the phone never draws that conclusion itself.
   *
   * Attachments are still not offered. The service takes `media` as an
   * `uploadId`, which means putting the file through the chunked upload flow
   * first; until that is wired, offering the control would drop the footage.
   */
  postComment(
    incidentId: string,
    body: string,
    isAnonymous?: boolean,
  ): Promise<import('@/types/comments').IncidentComment>;

  /** React to a report, or take the reaction back. */
  setReaction(incidentId: string, reacted: boolean): Promise<void>;

  /** Flag a report for a moderator. Persisted as a safety report on the service. */
  reportAbuse(input: { incidentId: string; reason: string }): Promise<void>;

  /**
   * Ask for a password reset email.
   *
   * The service answers the same way whether or not the address has an account,
   * so this cannot be used to find out who is registered.
   */
  requestPasswordReset(email: string): Promise<void>;

  /** The mobile money number commission is paid to, in international form. */
  setPayoutNumber(msisdn: string): Promise<void>;

  /** Register this phone's push token for the signed-in account. */
  registerPushToken(pushToken: string): Promise<void>;

  /**
   * Revoke a refresh token on the service.
   *
   * Clearing the phone alone left the token valid: anyone who had copied it could
   * go on refreshing a session the person believed they had ended.
   */
  logout(refreshToken: string): Promise<void>;

  /** Change the display name shown on the account and on reports filed under it. */
  updateProfile(input: { displayName: string }): Promise<void>;

  /** Change the password, proving the current one. */
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;

  /**
   * Delete the signed-in account.
   *
   * Reports already filed stay published but become anonymous; the service
   * refuses while commissions are outstanding.
   */
  deleteAccount(): Promise<void>;

  // ─── the organisation side ───────────────────────────────────────────────
  /*
   * Every call below is scoped by `X-Dawuro-Org`, which is why each one takes
   * an `orgId` rather than reading it from a store. The service refuses these
   * routes outright without the header — `check: "org_header"` — and checks the
   * named organisation against membership, so naming one you do not belong to
   * gets `check: "membership"` and nothing else. An id passed explicitly is an
   * id that cannot be forgotten by a caller that happens to run before the
   * profile has hydrated.
   */

  /** Counts for the organisation's home, and the plan behind them. */
  getOrgDashboard(orgId: string): Promise<OrgDashboard>;

  /**
   * Reports the platform routed to this organisation.
   *
   * Carries `licensed` and `licensedAt` per item, which is what makes a
   * licences list possible on a client at all.
   */
  getOrgInbox(orgId: string): Promise<Page<OrgInboxItem>>;

  /** One routed or licensed report, with freshly signed media. */
  getOrgIncident(orgId: string, incidentId: string): Promise<OrgInboxItem>;

  /**
   * Buy the right to use a report. **This spends money.**
   *
   * No request body — the terms come from the organisation's plan and the
   * reporter's destination choice, so the client cannot influence the price and
   * must not pretend to. The report's own id is the idempotency key, so a
   * double tap or a retried request cannot charge twice for the same footage.
   */
  licenseIncident(orgId: string, incidentId: string): Promise<LicenceResult>;

  /** The organisation's internal disposition. Not shown to the reporter. */
  setOrgIncidentStatus(
    orgId: string,
    incidentId: string,
    status: OrgIncidentStatus,
  ): Promise<void>;

  /**
   * What the organisation tells the reporter it is doing.
   *
   * This lands on the reporter's outcome timeline, under their own report. It
   * is the answer to the question the whole product asks a citizen to take a
   * risk on: did anybody do anything about it.
   */
  respondToIncident(
    orgId: string,
    incidentId: string,
    input: { action: OrgResponseAction; note?: string },
  ): Promise<void>;

  /**
   * Ask an editor to run a licensed report under this organisation's name.
   *
   * Does **not** publish. It creates a publication request the editorial desk
   * approves or declines, and the desk is required — the service rejects a
   * publish with no section and invents none.
   */
  requestPublication(
    orgId: string,
    incidentId: string,
    input: PublicationRequest,
  ): Promise<void>;

  /** Who is on their way to what. */
  getOrgAssignments(orgId: string): Promise<OrgAssignment[]>;

  /** Send somebody to a report. */
  createAssignment(
    orgId: string,
    input: { incidentId: string; assigneeId: string; note?: string },
  ): Promise<void>;

  /** Move a dispatch along, or reopen a closed one. */
  updateAssignment(
    orgId: string,
    assignmentId: string,
    input: { status: AssignmentStatusInput; note?: string },
  ): Promise<void>;

  /** The organisation's people — who a report can be dispatched to. */
  getOrgMembers(orgId: string): Promise<OrgMember[]>;

  // ─── becoming an organisation ────────────────────────────────────────────
  /*
   * The only `/org/*` routes a pending organisation may call. Everything else
   * under that prefix answers `403 check: "org_pending"` until a platform
   * administrator approves the application, which is why the onboarding screen
   * is a destination in its own right rather than a banner over the inbox.
   */

  /** The application so far: which steps are done, what was entered, what is attached. */
  getOnboarding(orgId: string): Promise<OnboardingApplication>;

  /** Save a step's answers and leave it editable. */
  saveOnboardingStep(
    orgId: string,
    stepId: OnboardingStepId,
    payload: Record<string, unknown>,
  ): Promise<OnboardingApplication>;

  /** Send one step for review. Refused while its required documents are missing. */
  submitOnboardingStep(orgId: string, stepId: OnboardingStepId): Promise<OnboardingApplication>;

  /**
   * Attach a document: declared, then its bytes sent.
   *
   * Two calls because that is what the service offers. The first records the
   * type, name, hash, media type and size and reserves the slot; the second
   * sends the bytes, which the service checks against the declared `sha256`
   * before it counts the document as attached.
   *
   * Both are needed. Declaring alone would leave a platform owner approving an
   * organisation's access to citizens' footage on the strength of a filename.
   */
  attachOnboardingDocument(
    orgId: string,
    input: {
      documentType: DocumentId;
      fileName: string;
      sha256: string;
      mimeType: string;
      byteSize: number;
    },
  ): Promise<void>;

  uploadOnboardingDocumentBytes(
    orgId: string,
    documentType: DocumentId,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<void>;

  /** Send the whole application for review. */
  submitOnboarding(orgId: string): Promise<OnboardingApplication>;
}

/** Narrowed here so the client interface does not re-export the whole union. */
type AssignmentStatusInput = OrgAssignment['status'];
