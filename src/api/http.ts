import { Platform } from 'react-native';
import {
  ApiError,
  type ApiErrorCode,
  type AuthoredIncident,
  type FeedQuery,
  type Incident,
  type Page,
  type TimePrecision,
} from '@/types/api';
import Constants from 'expo-constants';
import { getDeviceId, getPlatformDeviceId } from '@/services/deviceIdentity';
import { session } from '@/services/session';
import type {
  ApiClient,
  AuthTokens,
  CreateIncidentRequest,
  CreateIncidentResponse,
  DeviceRegistration,
  MapData,
  MapQuery,
  OrgDashboard,
  SignInRequest,
  UploadStatus,
} from './client';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Requests that hang forever are worse than requests that fail. */
const TIMEOUT_MS = 20_000;

/** Chunks are megabytes on a mobile connection; they need far longer. */
const CHUNK_TIMEOUT_MS = 120_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skips the Authorization header — used by the bootstrap calls. */
  anonymous?: boolean;
  idempotencyKey?: string;
  /** Internal: false once a token-rejection replay has already been spent. */
  retryAuth?: boolean;
}

export class HttpApiClient implements ApiClient {
  /** In-flight registration, so concurrent calls share one round trip. */
  private pendingAuth: Promise<void> | null = null;

  constructor(private readonly baseUrl: string) {}

  /**
   * Guarantees a usable token before any authenticated request.
   *
   * This lives in the client rather than in a startup effect because screens
   * mount and fire their queries on the same render as the effect that would
   * have registered the device — so a startup-effect approach races, and the
   * first feed request goes out unauthenticated. Making the precondition the
   * client's own responsibility removes the race entirely.
   *
   * Concurrent callers await the same promise, so a cold launch that renders
   * three screens at once still performs exactly one device registration.
   */
  private async ensureToken(): Promise<void> {
    const stored = await session.read();
    if (!session.isStale(stored)) return;

    this.pendingAuth ??= (async () => {
      try {
        const tokens = await this.registerDevice({
          deviceId: await getDeviceId(),
          platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
          platformDeviceId: await getPlatformDeviceId(),
          appVersion: APP_VERSION,
          buildNumber: 1,
        });
        await session.save(tokens);
      } finally {
        this.pendingAuth = null;
      }
    })();

    await this.pendingAuth;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, anonymous = false, idempotencyKey, retryAuth = true } = options;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Version': APP_VERSION,
      'X-Platform': Platform.OS,
      // VS Code dev tunnels serve an HTML interstitial to unrecognised clients
      // unless this header is present; without it every response parses as
      // "unexpected token <".
      'X-Tunnel-Skip-AntiPhishing-Page': 'true',
    };

    try {
      headers['X-Device-Id'] = await getDeviceId();
    } catch {
      // Keychain unavailable — the request still goes out, and the server
      // rejects it if it needed the header. Better than failing here silently.
    }

    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    if (!anonymous) {
      await this.ensureToken();
      const stored = await session.read();
      if (stored) headers.Authorization = `Bearer ${stored.accessToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      // A dropped connection is retryable; the outbox depends on that
      // distinction to decide whether to keep an upload alive.
      throw new ApiError({
        code: 'NETWORK_UNAVAILABLE',
        status: 0,
        message: cause instanceof Error ? cause.message : 'Network request failed',
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body from a proxy or gateway, not from the API itself.
      if (!response.ok) {
        throw new ApiError({
          code: 'INTERNAL',
          status: response.status,
          message: `Unexpected non-JSON response (${response.status})`,
          retryable: response.status >= 500,
        });
      }
    }

    if (!response.ok) {
      const error = toApiError(response.status, parsed);
      // A rejected token is recoverable exactly once: drop it, register again,
      // replay. `retryAuth` stops that from becoming a loop when the server
      // rejects every token we present.
      if (
        !anonymous &&
        retryAuth &&
        (error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_INVALID')
      ) {
        await session.clear();
        return this.request<T>(path, { ...options, retryAuth: false });
      }
      throw error;
    }
    return parsed as T;
  }

  // ─── auth ────────────────────────────────────────────────────────────────

  async registerDevice(input: DeviceRegistration): Promise<AuthTokens> {
    const res = await this.request<{ deviceToken: string; expiresAt: string }>('/devices', {
      method: 'POST',
      anonymous: true,
      body: input,
    });
    return { accessToken: res.deviceToken, refreshToken: null, expiresAt: res.expiresAt };
  }

  async signIn(input: SignInRequest): Promise<AuthTokens> {
    const res = await this.request<{
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    }>('/auth/signin', { method: 'POST', anonymous: true, body: input });
    return {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      expiresAt: res.expiresAt,
    };
  }

  // ─── upload ──────────────────────────────────────────────────────────────

  async createIncident(
    input: CreateIncidentRequest,
    idempotencyKey: string,
  ): Promise<CreateIncidentResponse> {
    return this.request<CreateIncidentResponse>('/incidents', {
      method: 'POST',
      body: input,
      idempotencyKey,
    });
  }

  async putChunk(uploadId: string, index: number, bytes: Uint8Array): Promise<void> {
    await this.ensureToken();
    const stored = await session.read();

    // Raw octet-stream, so this bypasses `request()` — that helper serialises
    // JSON and would corrupt the payload.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/chunks/${index}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Tunnel-Skip-AntiPhishing-Page': 'true',
          ...(stored ? { Authorization: `Bearer ${stored.accessToken}` } : {}),
        },
        // Uint8Array is a valid BodyInit; RN's fetch sends it verbatim.
        body: bytes as unknown as BodyInit,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }
        throw toApiError(response.status, parsed);
      }
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw new ApiError({
        code: 'NETWORK_UNAVAILABLE',
        status: 0,
        message: cause instanceof Error ? cause.message : 'Chunk upload failed',
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async completeUpload(uploadId: string): Promise<{ incidentId: string }> {
    return this.request<{ incidentId: string }>(`/uploads/${uploadId}/complete`, {
      method: 'POST',
      body: {},
    });
  }

  async getUploadStatus(uploadId: string): Promise<UploadStatus> {
    const res = await this.request<Partial<UploadStatus>>(`/uploads/${uploadId}`);
    return {
      uploadId: res.uploadId ?? uploadId,
      chunkSizeBytes: res.chunkSizeBytes ?? 0,
      chunkCount: res.chunkCount ?? 0,
      receivedChunks: res.receivedChunks ?? [],
      expiresAt: res.expiresAt ?? '',
    };
  }

  // ─── incidents ───────────────────────────────────────────────────────────

  async getFeed(query: FeedQuery = {}): Promise<Page<Incident>> {
    const page = await this.request<Page<RawIncident>>(`/incidents${toQueryString(query)}`);
    return { ...page, items: page.items.map(normaliseIncident) };
  }

  async getIncident(id: string): Promise<Incident> {
    return normaliseIncident(await this.request<RawIncident>(`/incidents/${id}`));
  }

  async getMapData(query: MapQuery = {}): Promise<MapData> {
    const params = new URLSearchParams();
    if (query.bbox) params.set('bbox', query.bbox);
    if (query.zoom !== undefined) params.set('zoom', String(query.zoom));
    query.category?.forEach((c) => params.append('category', c));
    const qs = params.toString();
    const res = await this.request<Partial<MapData>>(`/incidents/map${qs ? `?${qs}` : ''}`);
    return { clusters: res.clusters ?? [], markers: res.markers ?? [] };
  }

  async getMyIncidents(): Promise<Page<AuthoredIncident>> {
    const page = await this.request<Page<RawIncident & Partial<AuthoredIncident>>>('/me/incidents');
    return {
      ...page,
      items: page.items.map((raw) => ({
        ...normaliseIncident(raw),
        ...raw,
        capturedAtPrecision: derivePrecision(raw),
      })) as AuthoredIncident[],
    };
  }

  async getOrgDashboard(): Promise<OrgDashboard> {
    const res = await this.request<Partial<OrgDashboard>>('/org/dashboard');
    return {
      byCategory: res.byCategory ?? [],
      byState: res.byState ?? [],
      trend: res.trend ?? [],
      highPriority: res.highPriority ?? [],
    };
  }
}

// ─── normalisation ─────────────────────────────────────────────────────────

/** The wire shape, before the client fills in what the server omits. */
type RawIncident = Omit<Incident, 'capturedAtPrecision'> & {
  capturedAtPrecision?: TimePrecision;
};

/**
 * Infer how much of the timestamp may be shown.
 *
 * The backend does not yet send `capturedAtPrecision` (raised with them), so
 * this falls back to inspecting the value: a null timestamp means hidden, and
 * an exact-midnight-UTC timestamp means the time component was truncated.
 *
 * That midnight heuristic is imperfect by construction — an incident genuinely
 * captured at 00:00:00 UTC is indistinguishable from a suppressed one. Erring
 * toward `date_only` is the safe direction: it withholds a time that might be
 * real, rather than publishing one that was meant to be hidden.
 */
function derivePrecision(raw: RawIncident): TimePrecision {
  if (raw.capturedAtPrecision) return raw.capturedAtPrecision;
  if (!raw.capturedAtIso) return 'hidden';
  const d = new Date(raw.capturedAtIso);
  if (Number.isNaN(d.getTime())) return 'hidden';
  const isMidnightUtc =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return isMidnightUtc ? 'date_only' : 'exact';
}

function normaliseIncident(raw: RawIncident): Incident {
  return {
    ...raw,
    capturedAtPrecision: derivePrecision(raw),
    // A suppressed location arrives as null rather than a partial object;
    // give the UI a consistent shape so it only ever checks for null fields.
    location: raw.location ?? {
      latitude: null,
      longitude: null,
      label: null,
      confidence: 'high',
    },
    counts: raw.counts ?? { reactions: 0, comments: 0 },
  };
}

function toQueryString(query: FeedQuery): string {
  const params = new URLSearchParams();
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.sort) params.set('sort', query.sort);
  if (query.since) params.set('since', query.since);
  if (query.until) params.set('until', query.until);
  if (query.radiusM) params.set('radiusM', String(query.radiusM));
  if (query.near) params.set('near', `${query.near.latitude},${query.near.longitude}`);
  query.category?.forEach((c) => params.append('category', c));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const KNOWN_CODES = new Set<string>([
  'VALIDATION_FAILED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'FORBIDDEN',
  'INCIDENT_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'UPLOAD_EXPIRED',
  'MEDIA_TOO_LARGE',
  'GPS_ACCURACY_REJECTED',
  'MEDIA_HASH_MISMATCH',
  'RATE_LIMITED',
  'INTERNAL',
  'MAINTENANCE',
]);

function toApiError(status: number, parsed: unknown): ApiError {
  const envelope =
    parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as { error: { code?: string; message?: string; requestId?: string } }).error
      : null;

  const rawCode = envelope?.code ?? '';
  const code: ApiErrorCode = KNOWN_CODES.has(rawCode)
    ? (rawCode as ApiErrorCode)
    : status >= 500
      ? 'INTERNAL'
      : 'VALIDATION_FAILED';

  return new ApiError({
    code,
    status,
    message: envelope?.message ?? `Request failed with status ${status}`,
    ...(envelope?.requestId ? { requestId: envelope.requestId } : {}),
  });
}
