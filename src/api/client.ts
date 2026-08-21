import type { AuthoredIncident, FeedQuery, Incident, IncidentCategory, Page } from '@/types/api';

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
}

export interface SignInRequest {
  email: string;
  displayName?: string;
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
    altitude: number | null;
    heading: number | null;
    speed: number | null;
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

  /** Published incidents only. The server never returns other states here. */
  getFeed(query?: FeedQuery): Promise<Page<Incident>>;

  getIncident(id: string): Promise<Incident>;

  /** Clustered server-side; returning raw points would not hold 60fps. */
  getMapData(query?: MapQuery): Promise<MapData>;

  /** The caller's own reports, across every vetting state. */
  getMyIncidents(): Promise<Page<AuthoredIncident>>;

  getOrgDashboard(): Promise<OrgDashboard>;
}
