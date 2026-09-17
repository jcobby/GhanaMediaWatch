import { Platform } from 'react-native';
import {
  ApiError,
  type ApiErrorCode,
  type AuthoredIncident,
  type FeedQuery,
  type Incident,
  type ItemOrigin,
  type Page,
  type Reporter,
  type TimePrecision,
} from '@/types/api';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
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
  Caller,
  RegisterRequest,
  SignInRequest,
  UploadStatus,
} from './client';
import type { ReportOutcome } from '@/types/outcome';
import { PAYOUT_STATUSES } from '@/types/dawuro';
import type {
  CommissionEntry,
  DirectoryOrganisation,
  EarningsSummary,
  PayoutStatus,
  Survey,
} from '@/types/dawuro';
import { formatReportId } from '@/types/context';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Called when a signed-in session cannot be recovered.
 *
 * The client owns the token; the auth store owns the profile. Without this the
 * two disagree — the token is gone and the screen still shows somebody's name
 * and email, which is precisely how "Create an account to see this" came to
 * appear under a signed-in header.
 */
let onSignedOut: (() => void) | null = null;

export function setOnSignedOut(handler: (() => void) | null): void {
  onSignedOut = handler;
}

/**
 * Requests that hang forever are worse than requests that fail.
 *
 * Twelve seconds, not twenty. A JSON read that has not answered in twelve is
 * not going to, and the number is multiplied by the retry policy: at twenty it
 * took a full minute of spinner to discover that a dead backend was dead. The
 * reader cannot tell that apart from a hung app.
 */
const TIMEOUT_MS = 12_000;

/**
 * Whether request and response bodies are printed.
 *
 * On by default in development, because the question being asked of a log is
 * almost always "what did we actually send" — a status line alone cannot
 * answer it. Set `EXPO_PUBLIC_LOG_BODIES=0` to quieten it down to status lines
 * when the payloads are in the way.
 *
 * Failures print their body regardless: that is the case where withholding it
 * leaves the reader with nothing.
 */
const NETWORK_BODIES = process.env.EXPO_PUBLIC_LOG_BODIES !== '0';

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
  /**
   * The organisation an `/org/*` call is for.
   *
   * The service scopes those routes with a header and refuses them outright
   * without it — `FORBIDDEN: X-Dawuro-Org header is required for organisation
   * endpoints`, with `check: "org_header"` — so a call that omits it fails
   * whatever the token says. Checked against membership rather than trusted:
   * naming an organisation the caller does not belong to answers
   * `check: "membership"`.
   */
  orgId?: string;
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
        /*
         * A signed-in session is refreshed, never replaced.
         *
         * This used to register a *device* whenever the stored token was
         * stale — including for somebody who had signed in. Their account
         * quietly became a guest: the profile stayed in secure storage so the
         * screen still showed their name and email, while `/me/*` began
         * answering 403. What they saw was their own account above the words
         * "Create an account to see this".
         *
         * A guest has nothing to refresh and correctly gets a device token.
         */
        if (stored?.kind === 'user' && stored.refreshToken) {
          try {
            await session.save(await this.refresh(stored.refreshToken));
            return;
          } catch {
            /*
             * The refresh token is spent or rejected. That is a real sign-out,
             * and it has to look like one — falling through to a device token
             * here is the bug this whole branch exists to prevent.
             */
            await session.clear();
            onSignedOut?.();
            return;
          }
        }

        /*
         * Becoming a device is becoming a guest.
         *
         * Reached when the stored session is not a refreshable user session —
         * ordinarily a first launch, but also a signed-in session that has lost
         * its refresh token. In that second case the account is being demoted,
         * and the profile has to go with it or the phone shows a name above an
         * invitation to create an account.
         */
        if (stored?.kind === 'user') onSignedOut?.();

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
    const { method = 'GET', body, anonymous = false, retryAuth = true } = options;

    /*
     * Every state-creating POST carries one, generated here when the caller
     * has no better key.
     *
     * The server requires the header and rejects the request without it, which
     * is how account creation was failing: only `createIncident` was passing
     * one, so register, sign-in, comments and reactions all went out bare.
     *
     * A caller-supplied key is preferred where the same logical operation can
     * be retried from disk — the outbox passes the report's `clientId`, so a
     * replayed upload is recognised as the same submission rather than filed
     * twice. For a one-shot call a fresh id is the correct answer.
     */
    const idempotencyKey =
      options.idempotencyKey ?? (method === 'POST' ? Crypto.randomUUID() : undefined);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Version': APP_VERSION,
      'X-Platform': Platform.OS,
      // VS Code dev tunnels serve an HTML interstitial to unrecognised clients
      // unless this header is present; without it every response parses as
      // "unexpected token <".
      'X-Tunnel-Skip-AntiPhishing-Page': 'true',
      // Required on every organisation route. See `orgId` on RequestOptions.
      ...(options.orgId ? { 'X-Dawuro-Org': options.orgId } : {}),
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
    const startedAt = Date.now();

    logOutgoing(method, path, body);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      logRequest(method, path, null, Date.now() - startedAt, cause);
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

    if (response.status === 204) {
      logRequest(method, path, 204, Date.now() - startedAt);
      return undefined as T;
    }

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

    const envelope =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? (parsed as { error?: { code?: string; message?: string; requestId?: string } }).error
        : null;

    logRequest(
      method,
      path,
      response.status,
      Date.now() - startedAt,
      undefined,
      envelope ? describeEnvelope(envelope) : undefined,
      parsed,
    );

    if (!response.ok) {
      const error = toApiError(response.status, parsed);
      /*
       * A rejected token is recoverable exactly once: drop it, get another,
       * replay. `retryAuth` stops that becoming a loop when the server rejects
       * everything we present.
       *
       * `ensureToken` decides what "another" means — a refresh for somebody who
       * is signed in, a device registration for a guest. Clearing the session
       * here and letting it register a device unconditionally is what silently
       * demoted signed-in people to guests, so the signed-in case is handed a
       * refresh token to work with rather than an empty slot.
       */
      if (
        !anonymous &&
        retryAuth &&
        (error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_INVALID')
      ) {
        const held = await session.read();
        if (held?.kind === 'user' && held.refreshToken) {
          try {
            await session.save(await this.refresh(held.refreshToken));
          } catch {
            await session.clear();
            onSignedOut?.();
          }
        } else {
          /*
           * No way back in, so this is a sign-out and must look like one.
           *
           * This cleared the credential and left the identity behind. A
           * signed-in account whose refresh token was missing lost its session
           * here silently: the next request registered a *device*, `/me/*`
           * began answering "sign in first", and the profile stayed in secure
           * storage — so the phone showed somebody their own name and email
           * directly above the words "Create an account to see this".
           *
           * Clearing the session without clearing who it belonged to is the
           * whole bug. `onSignedOut` drops the profile with it.
           */
          await session.clear();
          if (held?.kind === 'user') onSignedOut?.();
        }
        // The same key, deliberately: this is a replay of one operation, not a
        // second one. A fresh key here would defeat the header's whole purpose.
        return this.request<T>(path, { ...options, idempotencyKey, retryAuth: false });
      }

      /*
       * A guest reaching their own records.
       *
       * The server refuses `/me/*` to a device token, which is correct — there
       * is no account for it to answer about. But the app was reading that 403
       * as an ordinary permissions failure and telling the reporter to contact
       * their organisation's administrator: advice about an organisation a
       * guest does not have, in place of the one sentence that would actually
       * help, which is that these records start existing once they have an
       * account.
       *
       * Narrowed to `/me/` on purpose. A 403 anywhere else really is a
       * permissions problem and keeps its original message.
       */
      if (error.code === 'FORBIDDEN' && path.startsWith('/me/')) {
        const stored = await session.read();
        if (stored?.kind === 'device') {
          throw new ApiError({
            code: 'SIGN_IN_REQUIRED',
            status: response.status,
            message: error.message,
            retryable: false,
          });
        }
      }

      throw error;
    }
    return parsed as T;
  }

  // ─── auth ────────────────────────────────────────────────────────────────

  async registerDevice(input: DeviceRegistration): Promise<AuthTokens> {
    /*
     * An absent platform id is sent as an absent field, not as null.
     *
     * `getPlatformDeviceId()` returns null on web, on iOS when the vendor id is
     * unavailable, and on any thrown error — and the server rejects an explicit
     * null with a 400. Registration is the first call the app makes, so those
     * users would never get past launch.
     *
     * Omitting says the same thing the null was saying and is what the server
     * accepts: the field is optional in its schema, just not nullable.
     */
    const { platformDeviceId, ...rest } = input;
    const body = platformDeviceId === null ? rest : { ...rest, platformDeviceId };

    const res = await this.request<{ deviceToken: string; expiresAt: string }>('/devices', {
      method: 'POST',
      anonymous: true,
      body,
    });
    return {
      accessToken: res.deviceToken,
      refreshToken: null,
      expiresAt: res.expiresAt,
      kind: 'device',
    };
  }

  /**
   * Signing in with a password.
   *
   * `/auth/login`, not `/auth/signin`. The latter takes an email alone and
   * creates the account if it does not recognise it — which meant a mistyped
   * address at the sign-in box silently produced a new empty account rather
   * than saying the details were wrong, and the password the user had just
   * typed was never checked against anything.
   */
  async signIn(input: SignInRequest): Promise<AuthTokens> {
    return this.authenticate('/auth/login', input);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.authenticate('/auth/refresh', { refreshToken });
  }

  async register(input: RegisterRequest): Promise<AuthTokens> {
    return this.authenticate('/auth/register', input);
  }

  /** Both endpoints answer with the same token envelope. */
  private async authenticate(path: string, body: unknown): Promise<AuthTokens> {
    const res = await this.request<{
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      refreshExpiresAt?: string;
    }>(path, { method: 'POST', anonymous: true, body });

    return {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      expiresAt: res.expiresAt,
      kind: 'user',
      ...(res.refreshExpiresAt ? { refreshExpiresAt: res.refreshExpiresAt } : {}),
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

  async getMapData(query: MapQuery): Promise<MapData> {
    const params = new URLSearchParams();
    // Always sent: the service requires it and answers 400 without one.
    params.set('bbox', query.bbox);
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
      /*
       * Normalised exactly like every other incident, and not un-normalised
       * afterwards.
       *
       * This used to spread the raw record back over the normalised one —
       * `{ ...normaliseIncident(raw), ...raw }` — which is a no-op for the
       * reporter-only fields (`normaliseIncident` already spreads `raw` first,
       * so `vettingState` and `rejectionReason` survive either way) and undoes
       * every correction for the rest. `media` was the one that showed:
       * `/me/incidents` returns `media.url` as the **relative**
       * `/v1/media/{id}?exp=…&sig=…`, the same as the public feed, and the raw
       * spread put that relative path back. So a reporter opening their own
       * report handed a path with no host to `downloadMedia` and to
       * `expo-image` — neither of which can resolve one — and got "could not be
       * opened" about footage the server was holding perfectly well.
       *
       * `location`, `counts`, `reporter`, `origin`, `reportId` and the poster
       * fallback were being reverted the same way, silently.
       */
      items: page.items.map((raw) => ({
        ...(normaliseIncident(raw) as AuthoredIncident),

        /*
         * The three the reporter's own screens depend on, defaulted rather than
         * asserted.
         *
         * All three are on the wire — verified against the live service — but
         * this is a cast, so an absent one arrives as `undefined` and nothing
         * anywhere says so. `destination` in particular decides which story the
         * outcome timeline tells: missing, a public submission would be
         * described as waiting to be routed to institutions that will never be
         * offered it. Falling back to `public` keeps the honest default, which
         * is also what the review screen offers first.
         */
        destination: raw.destination ?? 'public',
        requestedBusinessIds: raw.requestedBusinessIds ?? [],
        // `createdAt` is when it was filed; `publishedAt` is null until an
        // editor runs it, so it cannot stand in for one.
        createdAt: raw.createdAt ?? raw.publishedAt ?? '',
        publishedAt: raw.publishedAt ?? null,
      })),
    };
  }

  /**
   * Withdraw a report this account filed.
   *
   * Answers 204 with no body, so nothing is parsed. A 403 here means the caller
   * is not the author — the server is the only authority on that, and the app
   * does not try to guess it in advance.
   */
  async deleteIncident(incidentId: string): Promise<void> {
    await this.request<void>(`/incidents/${encodeURIComponent(incidentId)}`, {
      method: 'DELETE',
    });
  }

  async getReportResponses(incidentId: string): Promise<ReportOutcome> {
    const res = await this.request<{ items: RawResponse[] }>(
      `/me/incidents/${encodeURIComponent(incidentId)}/responses`,
    );

    return {
      incidentId,
      /*
       * Empty, because the endpoint does not return them.
       *
       * It answers "what has been done" but not "who has it", so an institution
       * holding a report in silence cannot be named — and naming the silent one
       * is the part a reporter can actually act on. `silentRecipients` therefore
       * finds nothing and the timeline shows only what happened. Raised with the
       * backend; the shape here is ready for them the moment they arrive.
       */
      recipients: [],
      responses: res.items.map((item) => ({
        id: item.id,
        businessId: item.org?.id ?? '',
        businessName: item.org?.name ?? '',
        action: item.action as ReportOutcome['responses'][number]['action'],
        note: item.note ?? null,
        atIso: item.createdAt,
      })),
    };
  }

  /*
   * Money, read defensively.
   *
   * `/me/earnings` and `/me/commissions` are live but carry no response schema
   * in the API document, so the exact field names are unconfirmed. Every value
   * is therefore defaulted rather than assumed: a missing total renders as zero
   * — which is true for a new reporter — instead of `NaN` on the one screen
   * where a wrong number is worse than no number.
   */
  async getEarnings(): Promise<EarningsSummary> {
    const raw = await this.request<Partial<EarningsSummary>>('/me/earnings');
    return {
      pendingPesewas: raw.pendingPesewas ?? 0,
      paidPesewas: raw.paidPesewas ?? 0,
      lifetimePesewas: raw.lifetimePesewas ?? 0,
      reportsLicensed: raw.reportsLicensed ?? 0,
      payoutThresholdPesewas: raw.payoutThresholdPesewas ?? 0,
      // Null is the honest answer before anything is owed: there is no run
      // scheduled for a reporter with nothing in the pot.
      nextPayoutIso: raw.nextPayoutIso ?? null,
    };
  }

  async getCommissions(): Promise<CommissionEntry[]> {
    // Tolerates either a bare array or a paged envelope.
    const raw = await this.request<
      Partial<CommissionEntry>[] | { items?: Partial<CommissionEntry>[] }
    >('/me/commissions');
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);

    /*
     * `payoutStatus` and `heldReason` arrived on 16 September, and they are the
     * two fields that tell a reporter whether the money actually moved. Read
     * defensively: an unrecognised status is dropped rather than shown, because
     * a word this app cannot explain is worse on a wallet than no word at all.
     */
    return items.map((item) => ({
      ...(item as CommissionEntry),
      payoutStatus: PAYOUT_STATUSES.includes(item.payoutStatus as PayoutStatus)
        ? (item.payoutStatus as PayoutStatus)
        : null,
      heldReason: typeof item.heldReason === 'string' && item.heldReason ? item.heldReason : null,
    }));
  }

  /**
   * The public organisation directory.
   *
   * Readable by any caller, including a guest device — a reporter choosing who
   * receives their footage must not have to hold an account first.
   */
  async getOrganisations(): Promise<DirectoryOrganisation[]> {
    const page = await this.request<Page<DirectoryOrganisation> | DirectoryOrganisation[]>(
      '/organisations',
    );
    return Array.isArray(page) ? page : (page.items ?? []);
  }

  /*
   * `GET /organisations/{id}/incidents` — published reports credited to one
   * organisation. It documents no response schema, so a bare list and a page
   * are both read, and every item goes through the same normalising as the feed.
   */
  async getOrganisationIncidents(organisationId: string): Promise<Incident[]> {
    const page = await this.request<Page<RawIncident> | RawIncident[]>(
      `/organisations/${encodeURIComponent(organisationId)}/incidents`,
    );
    const items = Array.isArray(page) ? page : (page.items ?? []);
    return items.map(normaliseIncident);
  }

  /*
   * `GET /organisations/{id}/surveys` — public, with no response schema. Read as
   * a summary may arrive: every field the survey card reads is given a safe
   * value, so a summary without `questions` or a reward cannot crash the page.
   */
  async getOrganisationSurveys(organisationId: string): Promise<Survey[]> {
    const page = await this.request<Page<Partial<Survey> & Record<string, unknown>> | (Partial<Survey> & Record<string, unknown>)[]>(
      `/organisations/${encodeURIComponent(organisationId)}/surveys`,
    );
    const items = Array.isArray(page) ? page : (page.items ?? []);
    const count = (value: unknown) =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
    return items.map((raw) => ({
      id: String(raw.id ?? ''),
      businessId: String(raw.businessId ?? raw.orgId ?? organisationId),
      businessName: String(raw.businessName ?? ''),
      title: String(raw.title ?? ''),
      description: String(raw.description ?? ''),
      questions: Array.isArray(raw.questions) ? raw.questions : [],
      rewardPesewas: count(raw.rewardPesewas),
      targetArea: raw.targetArea ?? null,
      responsesTarget: count(raw.responsesTarget),
      responsesReceived: count(raw.responsesReceived),
      closesAtIso: String(raw.closesAtIso ?? ''),
      // The service says `open`; the app's cards say `live`.
      status: raw.status === 'closed' ? 'closed' : raw.status === 'draft' ? 'draft' : 'live',
    }));
  }

  /** Reporter-facing surveys. Scoped to the caller by the server. */
  async getSurveys(): Promise<Survey[]> {
    const page = await this.request<Page<Survey> | Survey[]>('/surveys');
    return Array.isArray(page) ? page : (page.items ?? []);
  }

  async submitSurveyResponse(surveyId: string, answers: Record<string, unknown>): Promise<void> {
    await this.request<void>(`/surveys/${encodeURIComponent(surveyId)}/responses`, {
      method: 'POST',
      body: { answers },
      // One response per reporter per survey: a retry must not pay twice.
      idempotencyKey: `survey:${surveyId}`,
    });
  }

  /**
   * Describes the signed-in account, including the organisation it belongs to.
   *
   * This replaces a probe. Membership used to be inferred from whether
   * `/org/dashboard` refused the caller — a stand-in written when no endpoint
   * described the caller — and that inference broke completely once the service
   * began requiring a scope header on organisation routes: the probe could not
   * send an id it was calling the endpoint to discover, so it was refused every
   * time and every organisation account silently became a reporter.
   *
   * `/me` has no such requirement and answers the question directly.
   */
  async getCaller(): Promise<Caller> {
    const res = await this.request<Partial<Caller>>('/me');
    return {
      userId: res.userId ?? null,
      orgId: res.orgId ?? null,
      role: res.role ?? null,
      memberships: res.memberships ?? [],
    };
  }

  async getComments(incidentId: string): Promise<IncidentCommentShape[]> {
    // "Comments page" — a paged envelope or a bare array; both are accepted.
    const raw = await this.request<{ items?: RawComment[] } | RawComment[]>(
      `/incidents/${encodeURIComponent(incidentId)}/comments`,
    );
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items
      .map((item) => normaliseComment(item, incidentId))
      .filter((comment): comment is IncidentCommentShape => comment !== null)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }

  async postComment(
    incidentId: string,
    body: string,
    isAnonymous = false,
  ): Promise<IncidentCommentShape> {
    const raw = await this.request<RawComment | { comment?: RawComment }>(
      `/incidents/${encodeURIComponent(incidentId)}/comments`,
      // Only sent when it is true: the service's default is a named comment, and
      // an explicit `false` would be this client asserting something it was not asked to.
      { method: 'POST', body: { body, ...(isAnonymous ? { isAnonymous: true } : {}) } },
    );
    const inner = raw && typeof raw === 'object' && 'comment' in raw ? raw.comment : raw;
    /*
     * If the service answers with less than a comment, show the one that was
     * written rather than nothing — the list is refetched straight after, and the
     * server's copy replaces this one.
     */
    return (
      normaliseComment(inner as RawComment, incidentId) ?? {
        id: `cmt_pending_${Date.now()}`,
        incidentId,
        author: { handle: '', avatarUrl: null, isAnonymous },
        body,
        media: null,
        createdAtIso: new Date().toISOString(),
        isContribution: false,
        reactions: 0,
        viewerHasReacted: false,
      }
    );
  }

  async setReaction(incidentId: string, reacted: boolean): Promise<void> {
    const path = `/incidents/${encodeURIComponent(incidentId)}/reactions`;
    if (reacted) {
      await this.request<unknown>(path, {
        method: 'POST',
        body: { type: 'like' },
        // One like per person per report: a double tap must not count twice.
        idempotencyKey: `react:${incidentId}`,
      });
    } else {
      await this.request<void>(path, { method: 'DELETE' });
    }
  }

  async reportAbuse(input: { incidentId: string; reason: string }): Promise<void> {
    await this.request<unknown>('/abuse', {
      method: 'POST',
      body: { incidentId: input.incidentId, reason: input.reason },
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    // No account is needed to ask, and none should be implied by asking.
    await this.request<unknown>('/auth/password/forgot', {
      method: 'POST',
      body: { email },
      anonymous: true,
    });
  }

  async setPayoutNumber(msisdn: string): Promise<void> {
    await this.request<unknown>('/me/payout-msisdn', { method: 'PUT', body: { msisdn } });
  }

  async registerPushToken(pushToken: string): Promise<void> {
    await this.request<unknown>('/me/push-token', { method: 'PUT', body: { pushToken } });
  }

  async logout(refreshToken: string): Promise<void> {
    /*
     * Anonymous: the refresh token is the credential being revoked, and signing
     * out must not first try to refresh or register a device to make the call.
     */
    await this.request<unknown>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      anonymous: true,
    });
  }

  async updateProfile(input: { displayName: string }): Promise<void> {
    await this.request<unknown>('/me', { method: 'PATCH', body: { displayName: input.displayName } });
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.request<unknown>('/me/password', {
      method: 'PUT',
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
    });
  }

  async deleteAccount(): Promise<void> {
    await this.request<void>('/me', { method: 'DELETE' });
  }
}

type IncidentCommentShape = import('@/types/comments').IncidentComment;

/**
 * A comment as the service might send it.
 *
 * `GET /incidents/{id}/comments` publishes no response schema, so every field is
 * optional and read under the names a comment is likely to use. Anything
 * missing is filled rather than assumed.
 */
interface RawComment {
  id?: string;
  commentId?: string;
  body?: string;
  text?: string;
  createdAt?: string;
  createdAtIso?: string;
  isAnonymous?: boolean;
  displayName?: string;
  author?: {
    kind?: string;
    displayName?: string;
    handle?: string;
    name?: string;
    avatarUrl?: string | null;
    organisationName?: string | null;
  } | null;
  user?: { displayName?: string; avatarUrl?: string | null } | null;
  org?: { name?: string | null } | null;
  reactions?: number;
  reactionCount?: number;
  counts?: { reactions?: number };
  viewerHasReacted?: boolean;
}

/** Null for a row with no id, which cannot be rendered or keyed. */
function normaliseComment(raw: RawComment | null | undefined, incidentId: string) {
  if (!raw) return null;
  const id = raw.id ?? raw.commentId;
  if (!id) return null;

  const author = raw.author ?? null;
  const anonymous = raw.isAnonymous === true || author?.kind === 'anonymous';
  const organisationName = author?.organisationName ?? raw.org?.name ?? undefined;
  const handle =
    author?.displayName ??
    author?.handle ??
    author?.name ??
    raw.user?.displayName ??
    raw.displayName ??
    '';

  const comment: IncidentCommentShape = {
    id,
    incidentId,
    author: {
      handle,
      avatarUrl: author?.avatarUrl ?? raw.user?.avatarUrl ?? null,
      isAnonymous: anonymous || handle === '',
      ...(organisationName ? { organisationName } : {}),
    },
    body: raw.body ?? raw.text ?? '',
    // The service stores text only; attachments are not part of its comment.
    media: null,
    createdAtIso: raw.createdAtIso ?? raw.createdAt ?? new Date(0).toISOString(),
    isContribution: false,
    reactions: raw.reactions ?? raw.reactionCount ?? raw.counts?.reactions ?? 0,
    viewerHasReacted: raw.viewerHasReacted ?? false,
  };
  return comment;
}

/** One entry as `/me/incidents/{id}/responses` returns it. */
interface RawResponse {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  org?: { id: string; name: string | null };
}

/**
 * Every request, in the Metro console.
 *
 * Development only. The React Native debugger's Network panel does not reliably
 * capture `fetch`, so against a real backend the most common question — did that
 * call go out, what came back — had no quick answer. Two of this week's bugs
 * were a missing header and an unreachable host; both are obvious in one line
 * of log and invisible in a spinner.
 *
 * Nothing here prints a body. A request body carries a password on the auth
 * calls and precise coordinates on a submission, and a log line outlives the
 * screen it came from.
 */
/* eslint-disable no-console --
 * The rule exists to stop diagnostic output reaching production, and the
 * `__DEV__` guard below is what actually enforces that: this function returns
 * before printing anything in a release build. `console.warn` would satisfy the
 * linter and be worse — React Native renders a yellow box for each one, so a
 * screen making six calls would bury itself in warnings about nothing.
 */
/**
 * Secrets that must never reach a log line.
 *
 * A log outlives the screen it came from — it is scrolled back through, pasted
 * into a chat, screenshotted into a bug report. A password or a bearer token in
 * one of those is a credential leak with a long tail, so they are replaced
 * before anything is printed rather than trusted not to be looked at.
 */
const REDACTED = new Set([
  'password',
  'accessToken',
  'refreshToken',
  'deviceToken',
  'authorization',
  'idToken',
]);

/** A body, small enough to read and with its secrets removed. */
function summariseBody(body: unknown): string {
  if (body === undefined || body === null) return '';

  const seen = new WeakSet<object>();
  const safe = JSON.stringify(
    body,
    (key, value: unknown) => {
      if (REDACTED.has(key)) return '<redacted>';
      if (typeof value === 'object' && value !== null) {
        // A cycle in a request body is a programming error, but it should not
        // take the log — and therefore the debugging session — down with it.
        if (seen.has(value)) return '<circular>';
        seen.add(value);
      }
      return value;
    },
    2,
  );

  if (!safe) return '';
  // Long enough to read a payload, short enough not to bury the next request.
  return safe.length > 1200 ? `${safe.slice(0, 1200)}\n… truncated` : safe;
}

/**
 * One readable line from an error envelope.
 *
 * Only the first line of the message: a server stack trace arrives as fifty,
 * and fifty lines in a Metro log buries every other request on the screen. The
 * request id is kept because it is the one thing that lets the backend find
 * this exact failure in their own logs.
 */
function describeEnvelope(envelope: {
  code?: string;
  message?: string;
  requestId?: string;
}): string {
  const first = String(envelope.message ?? '').split(/\r?\n/)[0] ?? '';
  const id = envelope.requestId ? `  [${envelope.requestId}]` : '';
  return `${envelope.code ?? '?'}: ${first}${id}`;
}

/** Two spaces deeper than the status line, so a payload reads as attached. */
function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `         ${line}`)
    .join('\n');
}

/**
 * What is about to go out.
 *
 * Printed before the round trip, so a request that never returns still leaves a
 * record of what was attempted — which is the case where "what did we send?"
 * is hardest to answer and most worth knowing.
 */
function logOutgoing(method: string, path: string, body: unknown): void {
  if (!__DEV__ || !NETWORK_BODIES) return;
  const payload = summariseBody(body);
  console.log(`  API  -> ${method} ${path}` + (payload ? `\n${indent(payload)}` : ''));
}

function logRequest(
  method: string,
  path: string,
  status: number | null,
  ms: number,
  cause?: unknown,
  detail?: string,
  responseBody?: unknown,
): void {
  if (!__DEV__) return;

  const took = `${ms}ms`;
  if (status === null) {
    const reason = cause instanceof Error ? cause.message : 'network error';
    console.log(`  API  ${method} ${path} — FAILED after ${took} (${reason})`);
    return;
  }
  const marker = status >= 400 ? 'ERR ' : 'ok  ';

  const lines = [`  API  ${marker}${status} ${method} ${path} ${took}`];

  // The server's own reason on a failure. Without it a 500 is a number and
  // nothing else, and the next question — *why* — needs a separate tool.
  if (detail) lines.push(indent(detail));

  /*
   * The response body.
   *
   * Always shown for a failure, because a failure with its reason withheld is
   * the one case where the log has told you nothing. Otherwise only when
   * bodies are switched on, so a healthy feed request stays one line.
   */
  const payload = NETWORK_BODIES || status >= 400 ? summariseBody(responseBody) : '';
  if (payload) lines.push(indent(payload));

  console.log(lines.join('\n'));
}
/* eslint-enable no-console */

// ─── normalisation ─────────────────────────────────────────────────────────

/**
 * The wire shape, before the client fills in what the server omits.
 *
 * Four fields the app's own type requires are not yet returned. They are filled
 * below rather than made optional on `Incident`, so the gap stays in one place
 * and every screen can go on assuming a complete report.
 */
type RawIncident = Omit<Incident, 'capturedAtPrecision' | 'reportId' | 'origin' | 'reporter'> & {
  capturedAtPrecision?: TimePrecision;
  reportId?: string;
  /** A bare string: the server's vocabulary differs. See `normaliseOrigin`. */
  origin?: string;
  reporter?: Reporter;
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

/**
 * The server says `citizen`; this app says `citizen_report`.
 *
 * Same idea, different spelling, and the mismatch is silent in the worst way:
 * `origin === 'citizen_report'` simply evaluates false, so a citizen report
 * quietly loses its reporter credit and its link through to the publishing
 * organisation. Nothing throws and nothing logs.
 *
 * Mapped rather than renamed on either side, because a boundary is exactly
 * where a vocabulary difference should be absorbed — and because accepting both
 * spellings means whichever way the naming is reconciled later, this keeps
 * working.
 */
function normaliseOrigin(raw: string | undefined): ItemOrigin {
  if (raw === 'newsroom') return 'newsroom';
  // `citizen`, `citizen_report`, or absent — all mean a person filmed it.
  return 'citizen_report';
}

function normaliseIncident(raw: RawIncident): Incident {
  return {
    ...raw,
    capturedAtPrecision: derivePrecision(raw),

    /*
     * Derived with the same function the server is specified to use, so the
     * reference a reader quotes down a phone line matches the one on the
     * record. Identical inputs, identical output — but this is a stopgap, not
     * a design: the id belongs to the server, and a mismatch here would be
     * invisible until somebody read one aloud.
     */
    reportId: raw.reportId ?? formatReportId(raw.id),

    /*
     * Everything the backend serves today is a citizen report — it has no
     * newsroom concept yet — so this default is currently true rather than
     * merely safe. It stops being true the moment agency copy is ingested,
     * which is why the field is sent at all.
     */
    origin: normaliseOrigin(raw.origin),

    /*
     * Falls back to the publisher when they are the same party, which they are
     * for every report an institution has not republished. An organisation
     * publisher with no reporter is the case this cannot recover — the name is
     * simply not on the wire — so it reports anonymous rather than inventing
     * one.
     *
     * Optional because this runs inside a `.map` over a whole page: one item
     * arriving without a publisher used to throw here and take every other
     * report on the page with it, so a single malformed row served an empty
     * feed. One anonymous row is a far smaller failure.
     */
    reporter:
      raw.reporter ??
      (raw.publisher && raw.publisher.kind !== 'organisation'
        ? raw.publisher
        : { kind: 'anonymous' as const }),

    /*
     * Never missing, for the same reason as the reporter above.
     *
     * **This crashed the Africa desk.** The feed row and the top story began
     * reading `publisher.kind` to credit the organisation a report is from,
     * and a report arriving with no `publisher` threw inside the list — the
     * whole desk became an error screen. The detail screen and the
     * organisation pages read it the same way. Filled in once here, at the
     * boundary, every screen can rely on it.
     */
    publisher: raw.publisher ?? { kind: 'anonymous' as const },
    // A suppressed location arrives as null rather than a partial object;
    // give the UI a consistent shape so it only ever checks for null fields.
    location: raw.location ?? {
      latitude: null,
      longitude: null,
      label: null,
      confidence: 'high',
    },
    counts: raw.counts ?? { reactions: 0, comments: 0 },

    /*
     * A photo is its own poster.
     *
     * The service stores `posterUrl: null` for everything it holds — for a
     * video because it generates no still frame, and for a *photo* because the
     * photo is already at `media.url`. Every screen that shows a thumbnail
     * reads `posterUrl`, so a real photo report fell through to the bundled
     * category artwork: the feed showed a car for an accident and a lightning
     * bolt for a utility fault, and a reporter looking at their own report saw
     * a drawing instead of the thing they had filmed.
     *
     * Fixed once here, at the boundary, rather than in the feed row and the
     * slides viewer and the next screen to read it. A video keeps a null
     * poster: there is genuinely no still for it, and `Thumbnail` showing the
     * category scene is the right answer rather than a broken frame.
     */
    media: raw.media
      ? {
          ...raw.media,
          url: absoluteMedia(raw.media.url),
          posterUrl: absoluteMedia(posterFor(raw.media)),
          /*
           * The service's own copies, made absolute like everything else here.
           * Null stays null: a copy still being made is not an empty string, and
           * a screen falling back to `posterUrl` needs to be able to tell.
           */
          thumbUrl: raw.media.thumbUrl ? absoluteMedia(raw.media.thumbUrl) : null,
          viewUrl: raw.media.viewUrl ? absoluteMedia(raw.media.viewUrl) : null,
          playbackUrl: raw.media.playbackUrl ? absoluteMedia(raw.media.playbackUrl) : null,
          originalUrl: raw.media.originalUrl ? absoluteMedia(raw.media.originalUrl) : null,
        }
      : raw.media,
  };
}

/**
 * The still to draw for a report, or nothing.
 *
 * A photo is its own poster, which is the case the fallback below was written
 * for. The case it was not written for is the one the service actually serves
 * now: **for a video it echoes the media URL back as `posterUrl`** — the same
 * signed `/v1/media/{id}` that returns the MP4 or QuickTime file. Taken at face
 * value that hands a video to `expo-image` in every feed row and every slide,
 * which is precisely what it cannot decode. It fails without an error, so the
 * row falls back to the category artwork anyway — after pulling several
 * megabytes of footage down a mobile connection to discover it.
 *
 * So an echoed poster is treated as no poster. `Thumbnail` draws the category
 * scene immediately, the play badge says it is footage, and nothing is
 * downloaded until the reader opens the report. A genuine still — a frame the
 * service generates at some point — is a different URL and is used.
 */
function posterFor(media: NonNullable<RawIncident['media']>): string {
  const poster = media.posterUrl ?? '';
  if (media.kind === 'photo') return poster || media.url;
  return poster === media.url ? '' : poster;
}

/**
 * Where the media actually lives.
 *
 * The server returns `media.url` as a **relative** path —
 * `/v1/media/{id}?exp=…&sig=…` — and nothing in this client ever made it
 * absolute. `expo-image` cannot resolve a relative path and fails without an
 * error, so a real photo report showed the bundled category artwork in the feed
 * and a black rectangle on the detail screen. Both looked like missing media;
 * the file was there the whole time and the app was asking for it at no address
 * at all.
 *
 * The origin is the env var the client is already built against, so this cannot
 * disagree with where the request went. An absolute URL is passed through
 * untouched, and the signature is carried verbatim — stripping the query gives
 * 403 "Media URL signature is missing or expired".
 */
function absoluteMedia(url: string | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  const origin = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (!origin) return url;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
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
  // The desk filter. The feed used to narrow locally over a full page, which
  // only worked because the page was fixtures.
  query.section?.forEach((sec) => params.append('section', sec));
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
