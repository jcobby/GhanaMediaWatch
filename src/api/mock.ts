import type { AuthoredIncident, FeedQuery, Incident, Page } from '@/types/api';
import { ApiError } from '@/types/api';
import { UPLOAD_CHUNK_SIZE_BYTES } from '@/lib/constants';
import { chunkCount } from '@/services/chunkPlan';
import { SAMPLE_INCIDENTS } from './fixtures';
import { MY_REPORTS, ORG_STATS, ORG_TREND } from './mockData';
import { outcomeFor } from './outcomeData';
import { ORGANISATIONS, COMMISSION_LEDGER, EARNINGS_SUMMARY, SURVEYS } from './dawuroData';
import type {
  CommissionEntry,
  DirectoryOrganisation,
  EarningsSummary,
  Survey,
} from '@/types/dawuro';
import type { ReportOutcome } from '@/types/outcome';
import type {
  ApiClient,
  AuthTokens,
  Caller,
  CreateIncidentRequest,
  CreateIncidentResponse,
  DeviceRegistration,
  MapData,
  MapQuery,
  OrgDashboard,
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

  signIn(_input: SignInRequest): Promise<AuthTokens> {
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

  getMapData(query: MapQuery = {}): Promise<MapData> {
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

  register(input: RegisterRequest): Promise<AuthTokens> {
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

  /** The demo account operates the seeded organisation. */
  getCaller(): Promise<Caller> {
    return this.simulate({
      userId: 'usr_demo',
      orgId: 'org_demo',
      role: 'owner',
      memberships: [{ orgId: 'org_demo', role: 'owner', name: 'Adom TV News' }],
    });
  }

  getOrgDashboard(): Promise<OrgDashboard> {
    return this.simulate({
      byCategory: ORG_STATS.map((s) => ({ category: s.category, count: s.count })),
      byState: [
        { state: 'pending_review', count: 12 },
        { state: 'published', count: 287 },
        { state: 'rejected', count: 24 },
      ],
      trend: ORG_TREND.map((count, i) => ({
        date: new Date(Date.now() - (ORG_TREND.length - i) * 86_400_000).toISOString().slice(0, 10),
        count,
      })),
      highPriority: SAMPLE_INCIDENTS.slice(0, 3),
    });
  }
}
