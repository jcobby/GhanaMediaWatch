import type { AuthoredIncident, FeedQuery, Incident, Page } from '@/types/api';
import { ApiError } from '@/types/api';
import { UPLOAD_CHUNK_SIZE_BYTES } from '@/lib/constants';
import { chunkCount } from '@/services/chunkPlan';
import { SAMPLE_INCIDENTS } from './fixtures';
import { MY_REPORTS } from './mockData';
import { outcomeFor } from './outcomeData';
import { commentsFor } from './commentsData';
import {
  ORGANISATIONS,
  COMMISSION_LEDGER,
  EARNINGS_SUMMARY,
  SURVEYS,
  findDemoLogin,
} from './dawuroData';
import type {
  CommissionEntry,
  DirectoryOrganisation,
  EarningsSummary,
  Survey,
} from '@/types/dawuro';
import type { IncidentComment } from '@/types/comments';
import type { ReportOutcome } from '@/types/outcome';
import type {
  LicenceResult,
  OrgAssignment,
  OrgDashboard,
  OrgInboxItem,
  OrgMember,
} from '@/types/org';
import type {
  DocumentId,
  OnboardingApplication,
  OnboardingStepId,
} from '@/types/onboarding';
import type {
  ApiClient,
  AuthTokens,
  Caller,
  CreateIncidentRequest,
  CreateIncidentResponse,
  DeviceRegistration,
  MapData,
  MapQuery,
  RegisterRequest,
  SignInRequest,
  UploadStatus,
} from './client';

const latency = Number(process.env.EXPO_PUBLIC_MOCK_LATENCY_MS ?? 450);
const failureRate = Number(process.env.EXPO_PUBLIC_MOCK_FAILURE_RATE ?? 0);

/**
 * Fixture-backed client.
 *
 * Deliberately imperfect: it injects latency and, when configured, random
 * failures. A mock that always succeeds instantly means loading and error
 * states never get built, and they are exactly the states that matter on a
 * mobile connection in Accra.
 */
export class MockApiClient implements ApiClient {
  private async simulate<T>(value: T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, latency));
    if (failureRate > 0 && Math.random() < failureRate) {
      throw new ApiError({
        code: 'INTERNAL',
        status: 500,
        message: 'Injected mock failure',
        retryable: true,
      });
    }
    return value;
  }

  /**
   * In-memory record of which chunks this "server" has received, so the mock
   * exercises the real resumption path rather than pretending every upload
   * succeeds first time.
   */
  private readonly uploads = new Map<string, { received: Set<number>; chunkCount: number }>();

  /** Comments posted this session, served after the seeded ones. */
  private readonly postedComments = new Map<string, IncidentComment[]>();

  createIncident(
    input: CreateIncidentRequest,
    _idempotencyKey: string,
  ): Promise<CreateIncidentResponse> {
    const uploadId = `upl_${input.clientId}`;
    const count = chunkCount(input.media.byteSize, UPLOAD_CHUNK_SIZE_BYTES);
    this.uploads.set(uploadId, { received: new Set(), chunkCount: count });
    return this.simulate({
      incidentId: `inc_${input.clientId}`,
      uploadId,
      chunkSizeBytes: UPLOAD_CHUNK_SIZE_BYTES,
      chunkCount: count,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }

  putChunk(uploadId: string, index: number, _bytes: Uint8Array): Promise<void> {
    this.uploads.get(uploadId)?.received.add(index);
    return this.simulate(undefined);
  }

  completeUpload(uploadId: string): Promise<{ incidentId: string }> {
    return this.simulate({ incidentId: uploadId.replace('upl_', 'inc_') });
  }

  getUploadStatus(uploadId: string): Promise<UploadStatus> {
    const entry = this.uploads.get(uploadId);
    return this.simulate({
      uploadId,
      chunkSizeBytes: UPLOAD_CHUNK_SIZE_BYTES,
      chunkCount: entry?.chunkCount ?? 0,
      receivedChunks: [...(entry?.received ?? [])].sort((a, b) => a - b),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }

  registerDevice(_input: DeviceRegistration): Promise<AuthTokens> {
    return this.simulate({
      accessToken: 'mock-device-token',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      kind: 'device',
    });
  }

  /**
   * Who signed in last, so `getCaller` can answer about them.
   *
   * The real service knows this from the token. The mock has to remember it,
   * and before it did, `getCaller` answered "organisation" for everybody — so
   * on fixtures the demo sheet's two reporter accounts both landed in the
   * organisation app and the reporter experience was reachable only as a guest.
   */
  private signedInEmail: string | null = null;

  signIn(input: SignInRequest): Promise<AuthTokens> {
    this.signedInEmail = input.email;
    return this.simulate({
      accessToken: 'mock-user-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      kind: 'user',
    });
  }

  getFeed(query: FeedQuery = {}): Promise<Page<Incident>> {
    const filtered = query.category?.length
      ? SAMPLE_INCIDENTS.filter((i) => query.category!.includes(i.category))
      : SAMPLE_INCIDENTS;
    return this.simulate({ items: filtered, nextCursor: null, hasMore: false });
  }

  getIncident(id: string): Promise<Incident> {
    const found = SAMPLE_INCIDENTS.find((i) => i.id === id);
    if (!found) {
      return Promise.reject(
        new ApiError({ code: 'INCIDENT_NOT_FOUND', status: 404, message: 'No such incident' }),
      );
    }
    return this.simulate(found);
  }

  getMapData(query: MapQuery): Promise<MapData> {
    // Incidents whose reporter suppressed location never reach the map — a pin
    // is a location disclosure, so they are filtered before they are plotted.
    const plottable = SAMPLE_INCIDENTS.filter(
      (i) => i.location.latitude !== null && i.location.longitude !== null,
    ).filter((i) => !query.category?.length || query.category.includes(i.category));

    return this.simulate({
      clusters: [],
      markers: plottable.map((i) => ({
        id: i.id,
        latitude: i.location.latitude!,
        longitude: i.location.longitude!,
        category: i.category,
      })),
    });
  }

  getMyIncidents(): Promise<Page<AuthoredIncident>> {
    return this.simulate({ items: MY_REPORTS, nextCursor: null, hasMore: false });
  }

  deleteIncident(): Promise<void> {
    return this.simulate(undefined);
  }

  /**
   * An account this mock server now holds, so `getCaller` can answer about it.
   *
   * Registering as an organisation has to produce a *pending* one, because that
   * is the state the whole onboarding flow is written around — an approved
   * organisation would skip straight to the inbox and the wizard would be
   * unreachable without a backend.
   */
  private registered: { email: string; orgName: string | null } | null = null;

  /**
   * A Google identity, treated as a registration for an unknown address.
   *
   * The real service creates the account when the address is new and signs it
   * in when it is not, so the mock does the same — a reporter either way, since
   * `/auth/google` takes no organisation.
   */
  signInWithGoogle(input: { email: string }): Promise<AuthTokens> {
    this.registered = { email: input.email, orgName: null };
    return this.signIn({ email: input.email, password: 'google' });
  }

  register(input: RegisterRequest): Promise<AuthTokens> {
    this.registered =
      input.accountKind === 'organisation' && input.organisation
        ? { email: input.email, orgName: input.organisation.name }
        : { email: input.email, orgName: null };
    // Same envelope as signing in — the difference is on the server.
    return this.signIn({ email: input.email, password: input.password });
  }

  getReportResponses(incidentId: string): Promise<ReportOutcome> {
    // The seeded outcomes cover silence, referral, and resolution — the three
    // shapes the timeline has to render.
    return this.simulate(outcomeFor(incidentId) ?? { incidentId, recipients: [], responses: [] });
  }

  getEarnings(): Promise<EarningsSummary> {
    return this.simulate(EARNINGS_SUMMARY);
  }

  getCommissions(): Promise<CommissionEntry[]> {
    return this.simulate(COMMISSION_LEDGER);
  }

  /*
   * Narrowed to the directory shape the real endpoint sends.
   *
   * The fixtures are full `OrganisationAccount` records, so returning them as-is
   * would let a screen developed against the mock read `interests` or
   * `subscriptionStatus` and work perfectly — then find both undefined against
   * the live service. A mock that is more generous than the server is how that
   * bug got written in the first place.
   */
  getOrganisations(): Promise<DirectoryOrganisation[]> {
    return this.simulate(ORGANISATIONS);
  }

  getOrganisationSurveys(organisationId: string): Promise<Survey[]> {
    return this.simulate(SURVEYS.filter((s) => s.businessId === organisationId));
  }

  getOrganisationIncidents(organisationId: string): Promise<Incident[]> {
    return this.simulate(
      SAMPLE_INCIDENTS.filter(
        (i) => i.publisher.kind === 'organisation' && i.publisher.id === organisationId,
      ),
    );
  }

  refresh(): Promise<AuthTokens> {
    return this.simulate({
      accessToken: 'mock-user-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      kind: 'user',
    });
  }

  getSurveys(): Promise<Survey[]> {
    return this.simulate(SURVEYS);
  }

  submitSurveyResponse(): Promise<void> {
    return this.simulate(undefined);
  }

  /**
   * What the seeded login that signed in actually is.
   *
   * The demo sheet offers reporters, organisations and an operator, and this is
   * what makes that distinction mean anything on fixtures: an organisation
   * login gets a membership and lands in the organisation app, a reporter gets
   * none and lands in the reporter app. Registering — which does not go through
   * the demo list — is a reporter, as it is on the real service.
   *
   * This is not the account type being decided on the device: it is the mock
   * *server* answering about its own seeded accounts, which is exactly what the
   * real `/me` does. Nothing here runs when a backend is configured.
   */
  getCaller(): Promise<Caller> {
    /*
     * An account registered in this session answers first.
     *
     * An organisation created here is `verified: false` — pending, exactly as
     * the service creates one — so the app takes it to onboarding rather than
     * to an inbox that would be empty for a reason nothing on screen explains.
     */
    if (this.registered?.email === this.signedInEmail) {
      const { orgName } = this.registered;
      return this.simulate(
        orgName
          ? {
              userId: 'usr_applicant',
              orgId: 'org_pending',
              role: 'owner',
              memberships: [
                { orgId: 'org_pending', role: 'owner', name: orgName, verified: false },
              ],
            }
          : { userId: 'usr_new', orgId: null, role: null, memberships: [] },
      );
    }

    const login = this.signedInEmail ? findDemoLogin(this.signedInEmail) : undefined;

    if (login?.accountType !== 'organisation' || !login.businessId) {
      return this.simulate({ userId: 'usr_demo', orgId: null, role: null, memberships: [] });
    }

    return this.simulate({
      userId: 'usr_demo',
      orgId: login.businessId,
      role: 'admin',
      memberships: [
        {
          orgId: login.businessId,
          role: 'admin',
          name: login.businessName ?? login.displayName,
          verified: true,
        },
      ],
    });
  }

  getComments(incidentId: string): Promise<IncidentComment[]> {
    return this.simulate([
      ...commentsFor(incidentId),
      ...(this.postedComments.get(incidentId) ?? []),
    ]);
  }

  postComment(incidentId: string, body: string, isAnonymous = false): Promise<IncidentComment> {
    const comment: IncidentComment = {
      id: `cmt_mock_${Date.now()}`,
      incidentId,
      author: { handle: isAnonymous ? 'Anonymous' : 'You', avatarUrl: null, isAnonymous },
      body,
      media: null,
      createdAtIso: new Date().toISOString(),
      isContribution: false,
      reactions: 0,
      viewerHasReacted: false,
    };
    this.postedComments.set(incidentId, [...(this.postedComments.get(incidentId) ?? []), comment]);
    return this.simulate(comment);
  }

  setReaction(): Promise<void> {
    return this.simulate(undefined);
  }

  reportAbuse(): Promise<void> {
    return this.simulate(undefined);
  }

  requestPasswordReset(): Promise<void> {
    return this.simulate(undefined);
  }

  setPayoutNumber(): Promise<void> {
    return this.simulate(undefined);
  }

  registerPushToken(): Promise<void> {
    return this.simulate(undefined);
  }

  logout(): Promise<void> {
    return this.simulate(undefined);
  }

  updateProfile(): Promise<void> {
    return this.simulate(undefined);
  }

  changePassword(): Promise<void> {
    return this.simulate(undefined);
  }

  deleteAccount(): Promise<void> {
    return this.simulate(undefined);
  }

  // ─── the organisation side ───────────────────────────────────────────────
  /*
   * Licences are held in memory so the flow is exercisable without a backend:
   * licensing a report here really does move it out of the inbox's New filter
   * and into the Licences tab, and really does survive a navigation. It does
   * not survive a reload, which is correct — nothing was bought.
   */
  private readonly licensed = new Map<string, string>();

  /** The seeded organisation's routed inbox. */
  private inboxItems(): OrgInboxItem[] {
    return SAMPLE_INCIDENTS.filter((i) => i.origin === 'citizen_report').map((incident) => ({
      ...incident,
      licensed: this.licensed.has(incident.id),
      licensedAt: this.licensed.get(incident.id) ?? null,
    }));
  }

  getOrgDashboard(): Promise<OrgDashboard> {
    const items = this.inboxItems();
    return this.simulate({
      inboxCount: items.filter((i) => !i.licensed).length,
      publishedCount: items.filter((i) => i.licensed).length,
      openAssignments: this.assignments.filter((a) => a.status !== 'closed').length,
      subscription: {
        tier: 'standard' as const,
        status: 'active' as const,
        renewsAtIso: new Date(Date.now() + 18 * 86_400_000).toISOString(),
        seatsUsed: 4,
        reportsUsedThisPeriod: this.licensed.size,
      },
    });
  }

  getOrgInbox(): Promise<Page<OrgInboxItem>> {
    return this.simulate({ items: this.inboxItems(), nextCursor: null, hasMore: false });
  }

  getOrgIncident(_orgId: string, incidentId: string): Promise<OrgInboxItem> {
    const found = this.inboxItems().find((i) => i.id === incidentId);
    if (!found) {
      throw new ApiError({
        code: 'INCIDENT_NOT_FOUND',
        status: 404,
        message: 'No such report in this inbox',
      });
    }
    return this.simulate(found);
  }

  licenseIncident(_orgId: string, incidentId: string): Promise<LicenceResult> {
    this.licensed.set(incidentId, new Date().toISOString());
    // The seeded split mirrors the platform's published rates so the sheet's
    // arithmetic is exercisable: gross, the platform's cut, the reporter's.
    return this.simulate({
      incidentId,
      licensed: true,
      grossPesewas: 4_000,
      platformFeePesewas: 1_200,
      reporterPesewas: 2_800,
      downloadChargePesewas: 1_200,
    });
  }

  setOrgIncidentStatus(): Promise<void> {
    return this.simulate(undefined);
  }

  respondToIncident(): Promise<void> {
    return this.simulate(undefined);
  }

  requestPublication(): Promise<void> {
    return this.simulate(undefined);
  }

  private assignments: OrgAssignment[] = [];

  getOrgAssignments(): Promise<OrgAssignment[]> {
    return this.simulate([...this.assignments]);
  }

  createAssignment(
    _orgId: string,
    input: { incidentId: string; assigneeId: string; note?: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    const member = MOCK_MEMBERS.find((m) => m.userId === input.assigneeId);
    this.assignments = [
      {
        id: `asg_${this.assignments.length + 1}`,
        incidentId: input.incidentId,
        assigneeId: input.assigneeId,
        employeeName: member?.displayName ?? input.assigneeId,
        status: 'assigned',
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      },
      ...this.assignments,
    ];
    return this.simulate(undefined);
  }

  updateAssignment(
    _orgId: string,
    assignmentId: string,
    input: { status: OrgAssignment['status']; note?: string },
  ): Promise<void> {
    this.assignments = this.assignments.map((a) =>
      a.id === assignmentId
        ? { ...a, status: input.status, note: input.note ?? a.note, updatedAt: new Date().toISOString() }
        : a,
    );
    return this.simulate(undefined);
  }

  getOrgMembers(): Promise<OrgMember[]> {
    return this.simulate(MOCK_MEMBERS);
  }

  // ─── becoming an organisation ────────────────────────────────────────────
  /*
   * Held in memory, so the wizard is walkable end to end without a backend:
   * saving a step really does fill the fields in when you come back to it,
   * attaching a document really does tick the requirement off, and the
   * application really does refuse to be sent until every step has gone.
   */
  private application: OnboardingApplication = {
    id: 'onb_mock',
    status: 'draft',
    steps: [],
    payloads: {},
    documents: [],
    submittedAtIso: null,
  };

  getOnboarding(): Promise<OnboardingApplication> {
    return this.simulate({ ...this.application });
  }

  saveOnboardingStep(
    _orgId: string,
    stepId: OnboardingStepId,
    payload: Record<string, unknown>,
  ): Promise<OnboardingApplication> {
    this.application = {
      ...this.application,
      payloads: { ...this.application.payloads, [stepId]: payload },
      steps: [
        ...this.application.steps.filter((s) => s.id !== stepId),
        { id: stepId, status: 'in_progress', rejectionReason: null, submittedAtIso: null },
      ],
    };
    return this.simulate({ ...this.application });
  }

  submitOnboardingStep(_orgId: string, stepId: OnboardingStepId): Promise<OnboardingApplication> {
    this.application = {
      ...this.application,
      steps: [
        ...this.application.steps.filter((s) => s.id !== stepId),
        {
          id: stepId,
          status: 'submitted',
          rejectionReason: null,
          submittedAtIso: new Date().toISOString(),
        },
      ],
    };
    return this.simulate({ ...this.application });
  }

  attachOnboardingDocument(
    _orgId: string,
    input: { documentType: DocumentId; fileName: string; sha256: string },
  ): Promise<void> {
    this.application = {
      ...this.application,
      documents: [
        ...this.application.documents.filter((d) => d.id !== input.documentType),
        {
          id: input.documentType,
          fileName: input.fileName,
          sha256: input.sha256,
          uploadedAtIso: new Date().toISOString(),
        },
      ],
    };
    return this.simulate(undefined);
  }

  uploadOnboardingDocumentBytes(): Promise<void> {
    return this.simulate(undefined);
  }

  submitOnboarding(): Promise<OnboardingApplication> {
    this.application = {
      ...this.application,
      status: 'submitted',
      submittedAtIso: new Date().toISOString(),
    };
    return this.simulate({ ...this.application });
  }
}

/** Seeded colleagues, so the dispatch picker has somebody to pick. */
const MOCK_MEMBERS: OrgMember[] = [
  { userId: 'usr_demo', role: 'owner', email: 'desk@adomtv.test', displayName: 'Ama Boateng' },
  { userId: 'usr_field1', role: 'dispatcher', email: 'kofi@adomtv.test', displayName: 'Kofi Mensah' },
  { userId: 'usr_field2', role: 'analyst', email: 'efua@adomtv.test', displayName: 'Efua Asante' },
];
