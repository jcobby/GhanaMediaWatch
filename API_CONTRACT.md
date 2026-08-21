# API Contract — GhanaMediaWatch

**Audience:** the engineer building the backend.
**Status:** proposed by the frontend, not yet agreed. Everything in [§10 Assumptions to confirm](#10-assumptions-to-confirm) needs your sign-off before it hardens.

The mobile client is built against this contract via a swappable `ApiClient` interface. A `MockApiClient` implements it locally with seeded fixtures, so **frontend work never blocks on the backend** — but it also means any drift between this document and your implementation surfaces only at integration. If you need to change something here, say so and we change it together.

---

## 1. Conventions

### Base URL and versioning

```
https://api.example.gh/v1
```

The version lives in the path. The client reads the origin from `EXPO_PUBLIC_API_URL` and appends `/v1`. Breaking changes require `/v2`; additive fields do not.

### Authentication

Bearer JWT in the `Authorization` header.

```http
Authorization: Bearer <accessToken>
```

- **Access token** — short-lived (proposed 15 min), sent on every request.
- **Refresh token** — long-lived (proposed 60 days), stored in `expo-secure-store`, exchanged at `POST /auth/refresh`.

Three caller identities exist, and **every endpoint below states which it accepts**:

| Identity     | How it is obtained                                               | What it can do                                                        |
| ------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `device`     | `POST /devices` with no credentials                              | Submit incidents, read the public feed. No profile.                   |
| `user`       | `POST /auth/signin`                                              | Everything `device` can, plus own-report management and interactions. |
| `org_member` | `POST /auth/signin` where the account belongs to an organisation | Adds the `/org/*` surface, scoped by role.                            |

A device token is **not** an anonymity mechanism — see [§3](#3-identity-and-anonymity).

### Required headers

| Header             | Example            | Notes                                                                  |
| ------------------ | ------------------ | ---------------------------------------------------------------------- |
| `Authorization`    | `Bearer eyJ…`      | Except `POST /devices` and `POST /auth/*`.                             |
| `X-Device-Id`      | `9f1c…`            | The SecureStore UUID. Sent on **every** request, authenticated or not. |
| `X-Client-Version` | `1.0.0 (42)`       | App version and build number, for support triage.                      |
| `X-Platform`       | `android` or `ios` |                                                                        |
| `Idempotency-Key`  | UUID v4            | Required on all `POST` that create state. See below.                   |

### Content types

`application/json; charset=utf-8` everywhere, **except** upload chunk bodies, which are `application/octet-stream`.

### Error envelope

Every non-2xx response uses exactly this shape. No bare strings, no HTML error pages.

```json
{
  "error": {
    "code": "GPS_ACCURACY_REJECTED",
    "message": "Location accuracy of 84 m exceeds the 20 m submission limit.",
    "details": { "accuracyM": 84, "limitM": 20 },
    "requestId": "01JBX7Q2K9"
  }
}
```

- `code` — stable `SCREAMING_SNAKE_CASE`. The client switches on this, never on `message`.
- `message` — human-readable English. **The client does not show this to users**; it maps `code` to a localised string. Treat `message` as developer-facing.
- `details` — optional, typed per code. See [§9](#9-error-code-reference).
- `requestId` — echo this in logs. The client surfaces it in bug reports.

Field-level validation failures use `code: "VALIDATION_FAILED"` with:

```json
{ "details": { "fields": { "category": "Unknown category 'trafic'." } } }
```

### Pagination

**Cursor-based, not offset.** The feed changes under the user's feet as reports clear review; offsets would duplicate and skip items.

```http
GET /incidents?limit=20&cursor=eyJpZCI6…
```

```json
{
  "items": [],
  "nextCursor": "eyJpZCI6…",
  "hasMore": true
}
```

- `limit` defaults to 20, max 50.
- `nextCursor` is `null` when exhausted. The client treats the cursor as **opaque** — encode whatever you like in it.
- Never return `total`. It is expensive and the client does not use it.

### Idempotency

Capture happens offline and the outbox retries. **The same submission will arrive more than once.**

Every state-creating `POST` accepts `Idempotency-Key`. On a repeat key within 24 hours, return the **original response and status code**, not a conflict. Without this, a user on a flaky connection gets duplicate reports on the public feed.

### Rate limiting

`429` with `Retry-After` in seconds. The client's sync engine already backs off exponentially (2s, 8s, 30s, 2m, 10m, 1h) and will honour `Retry-After` when present.

### Time and coordinates

- All server timestamps are **ISO 8601 UTC with `Z`**: `2026-08-19T14:32:05.123Z`.
- **Device-reported capture time is separate and is not trusted.** The client sends `capturedAtIso` (device local clock), `capturedAtUtcOffsetMinutes`, and `deviceUptimeMs`. Store all three. A large gap between device time and server receipt time, or a device uptime inconsistent with the claimed capture time, is a tamper signal for vetting.
- Coordinates are decimal degrees, WGS 84, serialised as JSON numbers with **6 decimal places** (~0.11 m). Never strings.
- Distances are metres, durations are milliseconds, sizes are bytes. All integers unless noted.

---

## 2. Domain model

### Enumerations

These are closed sets. The client has them as TypeScript unions; adding a value is a **breaking change** unless the client ships the new value first.

```ts
type IncidentCategory =
  | 'fire'
  | 'accident'
  | 'disorder' // emergency
  | 'infrastructure'
  | 'utility'
  | 'corruption' // civic
  | 'environment'
  | 'wildlife' // environment
  | 'flood'
  | 'crime'
  | 'health'
  | 'other';

type VettingState = 'pending_review' | 'published' | 'rejected' | 'restricted';

type MediaKind = 'photo' | 'video';

type LocationConfidence = 'high' | 'low';
```

### Incident (public shape)

What the feed and detail endpoints return. **Note the nullable metadata fields** — see [§7](#7-display-flags--the-most-important-section-here).

```json
{
  "id": "inc_01JBX7Q2K9",
  "category": "flood",
  "description": "Culvert blocked, road impassable at the junction.",
  "vettingState": "published",
  "publishedAt": "2026-08-19T14:40:11.000Z",

  "media": {
    "kind": "video",
    "url": "https://cdn.example.gh/m/01JBX7.mp4",
    "posterUrl": "https://cdn.example.gh/m/01JBX7.jpg",
    "width": 1080,
    "height": 1920,
    "durationMs": 24500,
    "byteSize": 8421376
  },

  "location": {
    "latitude": 5.603717,
    "longitude": -0.186964,
    "label": "Kaneshie, Accra",
    "confidence": "high"
  },

  "capturedAtIso": "2026-08-19T14:31:00.000Z",

  "publisher": { "kind": "anonymous" },

  "counts": { "reactions": 42, "comments": 7 },
  "viewerHasReacted": false
}
```

For an attributed report, `publisher` is instead:

```json
{ "kind": "user", "id": "usr_01H…", "displayName": "Ama K.", "avatarUrl": "https://…" }
```

### Incident (author's own shape)

`GET /me/incidents` returns the above **plus** the fields only the author may see:

```json
{
  "vettingState": "rejected",
  "rejectionReason": "Footage does not show the described incident.",
  "displayFlags": { "showLocation": true, "showDate": true, "showTime": false },
  "isAnonymous": true,
  "locationMocked": false,
  "location": { "accuracyM": 8.4, "altitude": 61.2, "heading": 142.0, "speed": 0.0 }
}
```

---

## 3. Identity and anonymity

**Read this before implementing `POST /devices`.**

- The client generates a **UUID v4 on first launch** and persists it in `expo-secure-store`. This is the **primary** device identifier, sent as `X-Device-Id` on every request.
- It also sends a **secondary** platform identifier — `Application.getAndroidId()` on Android, `getIosIdForVendorAsync()` on iOS. **Both reset on uninstall or factory reset and are not stable.** Use them as a weak correlation signal only; never as a primary key.
- **`deviceId` is attached to anonymous submissions too.** This is the accountability mechanism the product depends on, and the client tells the user so, plainly, before they publish.

**What anonymity means in this contract:** the public API must never expose `deviceId`, the author's account, or any derived identifier on an anonymous report — not in the feed, not in detail, not in comments, not in an ETag or URL. Internally you retain the link for abuse handling and lawful process. The client shows users an honest explainer sheet saying exactly this; do not implement anything that would make that explainer a lie.

---

## 4. Endpoints — capture and submission

### `POST /devices` — register a device _(no auth)_

Called once on first launch, and again if the token is lost.

```json
{
  "deviceId": "9f1c…",
  "platform": "android",
  "platformDeviceId": "a1b2c3d4e5f6",
  "appVersion": "1.0.0",
  "buildNumber": 42
}
```

Returns `201` with `{ "deviceToken": "eyJ…", "expiresAt": "2026-10-18T…Z" }`

### The upload protocol

A 60-second video over Ghanaian mobile data **will** drop mid-flight. Uploads are therefore **resumable and chunked**, in three phases.

| Phase | Call                           | Carries                                                         |
| ----- | ------------------------------ | --------------------------------------------------------------- |
| 1     | `POST /incidents`              | Metadata only. Returns `uploadId` and the chunk plan.           |
| 2     | `PUT /uploads/{id}/chunks/{n}` | Raw bytes. Repeatable, order-independent.                       |
| 3     | `POST /uploads/{id}/complete`  | Nothing. Server assembles, verifies hash, enqueues for vetting. |

If the app dies mid-upload, the client calls `GET /uploads/{id}` on next launch to learn which chunks you already hold, then resumes. **It does not restart from zero.**

#### 1. `POST /incidents` — initialise _(auth: device or user)_

Metadata only. No bytes. Requires `Idempotency-Key`.

```json
{
  "clientId": "e3a1…",
  "category": "flood",
  "description": "Culvert blocked, road impassable at the junction.",
  "isAnonymous": true,
  "displayFlags": { "showLocation": true, "showDate": true, "showTime": false },

  "location": {
    "latitude": 5.603717,
    "longitude": -0.186964,
    "accuracyM": 8.4,
    "altitude": 61.2,
    "heading": 142.0,
    "speed": 0.0,
    "confidence": "high",
    "isMocked": false
  },

  "capturedAtIso": "2026-08-19T14:31:00.000Z",
  "capturedAtUtcOffsetMinutes": 0,
  "deviceUptimeMs": 184523110,

  "media": {
    "kind": "video",
    "mimeType": "video/mp4",
    "byteSize": 8421376,
    "durationMs": 24500,
    "width": 1080,
    "height": 1920,
    "sha256": "9f86d081884c7d65…"
  }
}
```

Returns `201`:

```json
{
  "incidentId": "inc_01JBX7Q2K9",
  "uploadId": "upl_01JBX7Q2K9",
  "chunkSizeBytes": 5242880,
  "chunkCount": 2,
  "expiresAt": "2026-08-20T14:31:00.000Z"
}
```

**`clientId`** is the client's local row id. Return it on the resulting incident so the outbox can reconcile without relying on ordering.

**`sha256`** is of the complete media file. Verify it at `complete` and reject with `MEDIA_HASH_MISMATCH` if it differs — that is the client's signal to re-upload rather than silently publishing corrupt footage.

The client proposes `chunkSizeBytes = 5 MiB`; **your response is authoritative** and the client will use whatever you return.

#### 2. `PUT /uploads/{uploadId}/chunks/{index}` — send bytes _(auth: same as init)_

`index` is **0-based**. Body is `application/octet-stream`, raw bytes, no multipart wrapper.

```http
PUT /v1/uploads/upl_01JBX7Q2K9/chunks/0
Content-Type: application/octet-stream
Content-Length: 5242880
```

Returns `200` with `{ "index": 0, "received": true, "bytesReceived": 5242880 }`

Must be **idempotent** — re-sending a chunk you already hold returns `200`, not an error. Chunks may arrive in any order; the client sends them sequentially but retries can reorder them.

#### 3. `POST /uploads/{uploadId}/complete` _(auth: same as init)_

Empty body. Returns `200` with the full incident in its author shape, `vettingState` set by your routing rules ([§6](#6-vetting-workflow)).

Only after this succeeds does the client delete the local media file. **It keeps the metadata row** so the user retains a personal history. If you later garbage-collect media, the client's history entry will point at a dead `serverId` — tell us how long media is retained ([§10](#10-assumptions-to-confirm)).

#### `GET /uploads/{uploadId}` — resume _(auth: same as init)_

```json
{
  "uploadId": "upl_01JBX7Q2K9",
  "chunkSizeBytes": 5242880,
  "chunkCount": 2,
  "receivedChunks": [0],
  "expiresAt": "2026-08-20T14:31:00.000Z"
}
```

If the upload has expired, return `410 UPLOAD_EXPIRED`. The client restarts from `POST /incidents`.

---

## 5. Endpoints — reading

### `GET /incidents` — the public feed _(auth: device or user)_

**Returns only `vettingState: "published"`.** Never leak other states here.

| Query param       | Type                 | Notes                                       |
| ----------------- | -------------------- | ------------------------------------------- |
| `limit`, `cursor` |                      | See [§1](#pagination).                      |
| `category`        | repeatable           | `?category=fire&category=flood` means OR.   |
| `near`            | `lat,lng`            | Enables `distanceM` on each item.           |
| `radiusM`         | integer              | Requires `near`.                            |
| `since`, `until`  | ISO 8601             | On `publishedAt`.                           |
| `sort`            | `recent` or `nearby` | Default `recent`. `nearby` requires `near`. |

### `GET /incidents/map` — clustered markers _(auth: device or user)_

The map tab needs a different shape — clusters, not a page of full records.

```http
GET /incidents/map?bbox=-0.3,5.5,-0.1,5.7&zoom=12&category=flood
```

```json
{
  "clusters": [
    { "latitude": 5.61, "longitude": -0.19, "count": 14, "categories": ["flood", "utility"] }
  ],
  "markers": [
    { "id": "inc_01JBX7Q2K9", "latitude": 5.603717, "longitude": -0.186964, "category": "flood" }
  ]
}
```

Cluster server-side. Returning 4,000 raw points and clustering on-device will not hold 60 fps.

### `GET /incidents/{id}` _(auth: device or user)_

Returns the public shape. `404 INCIDENT_NOT_FOUND` if it is not published and the caller is not the author — **not `403`**, which would confirm the report exists.

### `GET /me/incidents` — the author's own reports _(auth: user)_

Returns **all** states, in the author shape, with `rejectionReason` where applicable. Filter with `?state=pending_review`.

### `PATCH /incidents/{id}` — edit display settings _(auth: user, author only)_

The account owner can change these **after publication**.

```json
{ "displayFlags": { "showLocation": false, "showDate": true, "showTime": true } }
```

Also accepts `description`. **Editing `description` after publication must re-enter review** — otherwise it is a trivial bait-and-switch on approved footage.

### `DELETE /incidents/{id}` _(auth: user, author only)_

Soft-delete. Returns `204`.

---

## 6. Vetting workflow

Every report enters at `pending_review` and leaves to exactly one terminal state.

| State            | In public feed? | Visible to author?              | Meaning                                                                                     |
| ---------------- | --------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `pending_review` | No              | Yes, with an explanatory banner | Awaiting a human or automated decision.                                                     |
| `published`      | **Yes**         | Yes                             | Cleared for public display.                                                                 |
| `rejected`       | No              | Yes, with `rejectionReason`     | Declined. The reason string is shown verbatim, so write it for the reporter, not for staff. |
| `restricted`     | No              | Yes, with a banner              | Held for security sensitivity. Visible to authorised org accounts only.                     |

The brief says reports "may be vetted or automatically uploaded … based on public or security sensitivity". **The client does not decide this** — it renders whatever state you return. Which categories auto-publish, and who triggers human review, is [an open question](#10-assumptions-to-confirm).

---

## 7. Display flags — the most important section here

Each report carries three booleans set by the reporter at review time and editable later:

```ts
{
  showLocation: boolean;
  showDate: boolean;
  showTime: boolean;
}
```

**These are display flags, not storage flags.** You still store the true latitude, longitude, and capture timestamp for every report, always — vetting, abuse investigation, and lawful requests all depend on it.

**The contract obligation is this:** on any endpoint serving a _public_ audience — the feed, map, public detail, comments — the server must **omit or null the suppressed fields**, not send them and trust the client to hide them.

| Flag           | When `false`, public responses must …                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showLocation` | Set `location.latitude`, `longitude`, and `label` to `null`. **Also suppress the item from `/incidents/map`** and from `near`/`radiusM` filtering — a marker on a map is a location disclosure. |
| `showDate`     | Set `capturedAtIso` to `null`. Return `publishedAt` truncated to the hour if you need an ordering key.                                                                                          |
| `showTime`     | Return `capturedAtIso` truncated to midnight UTC (`2026-08-19T00:00:00.000Z`).                                                                                                                  |

The client enforces the same rules independently and has unit tests asserting a hidden value never renders. **Both layers are required.** Client-side hiding alone means the true coordinates travel to every phone that scrolls past the report and sit in an inspectable cache; server-side alone means one client bug leaks them. Defence in depth is not optional for a feature whose failure mode is exposing a reporter's location.

If `showDate` is `false` but `showTime` is `true`, suppress both — a bare time with no date is meaningless and still narrows the window. The client greys out the combination but do not rely on that.

---

## 8. Endpoints — institution / business tier

Gated by role. **Hiding UI is not authorisation** — the client hides `/org` routes for non-members as a courtesy, and every endpoint below must independently enforce membership and role.

### `GET /org/dashboard`

Counts by category and status, a trend series, and recent high-priority reports.

```json
{
  "byCategory": [{ "category": "flood", "count": 128 }],
  "byState": [{ "state": "pending_review", "count": 12 }],
  "trend": [{ "date": "2026-08-12", "count": 18 }],
  "highPriority": []
}
```

### Saved queries — an org's standing watch criteria

`GET` and `POST` on `/org/queries`; `GET`, `PATCH`, `DELETE` on `/org/queries/{id}`.

```json
{
  "id": "qry_01H…",
  "name": "Flooding — Odaw catchment",
  "categories": ["flood", "infrastructure"],
  "keywords": ["culvert", "drain"],
  "geofence": {
    "kind": "circle",
    "center": { "latitude": 5.603717, "longitude": -0.186964 },
    "radiusM": 3000
  },
  "timeWindow": { "since": "2026-08-01T00:00:00.000Z" },
  "alerts": { "push": true, "email": false }
}
```

`geofence.kind` is `circle` or `polygon`; polygon carries `points: [{latitude, longitude}]`. The client's editor draws both.

**A saved query must never match a report whose `showLocation` is `false`** via its geofence. Suppressed location means suppressed from location-based matching, including for paying orgs.

### `GET /org/queries/{id}/results`

Paginated incidents matching the query. Same shape and same display-flag rules as the public feed.

### Report inbox

| Method | Path                         | Body                                                             |
| ------ | ---------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/org/incidents`             | Filter, sort, paginate.                                          |
| `POST` | `/org/incidents/{id}/status` | `{ "status": "in_review" \| "actioned" \| "dismissed" }`         |
| `POST` | `/org/incidents/{id}/notes`  | `{ "body": "Dispatched crew 14:20." }` — internal, never public. |

### `POST /org/exports`

```json
{ "format": "csv", "queryId": "qry_01H…" }
```

Returns `202` with `{ "exportId": "exp_01H…", "status": "pending" }`.

The client polls `GET /org/exports/{id}` until `status: "ready"`, then downloads `url` and hands it to `expo-sharing`. **Async, not a blocking download** — a 90-day CSV will time out a mobile request.

### Members

`GET /org/members`, `POST /org/members/invite`, `PATCH /org/members/{id}` (role), `DELETE /org/members/{id}`.

Roles: `owner`, `admin`, `analyst`, `viewer`.

---

## 9. Error code reference

| HTTP | `code`                  | When                              | Client behaviour                            |
| ---- | ----------------------- | --------------------------------- | ------------------------------------------- |
| 400  | `VALIDATION_FAILED`     | Malformed body                    | Shows a field error. Does **not** retry.    |
| 401  | `TOKEN_EXPIRED`         | Access token expired              | Refreshes once, replays the request.        |
| 401  | `TOKEN_INVALID`         | Bad or revoked token              | Signs the user out.                         |
| 403  | `FORBIDDEN`             | Role insufficient                 | Shows an explanatory screen.                |
| 404  | `INCIDENT_NOT_FOUND`    | Missing, or not visible to caller | Generic not-found.                          |
| 409  | `IDEMPOTENCY_CONFLICT`  | Key reused with a different body  | Logs; does not retry.                       |
| 410  | `UPLOAD_EXPIRED`        | Upload window elapsed             | Restarts from `POST /incidents`.            |
| 413  | `MEDIA_TOO_LARGE`       | Exceeds the size limit            | Fails the item permanently, tells the user. |
| 422  | `GPS_ACCURACY_REJECTED` | `accuracyM` above your limit      | Fails permanently with an explanation.      |
| 422  | `MEDIA_HASH_MISMATCH`   | `sha256` mismatch at complete     | Re-uploads from chunk 0.                    |
| 429  | `RATE_LIMITED`          | Too many requests                 | Backs off, honours `Retry-After`.           |
| 500  | `INTERNAL`              | Anything unhandled                | Retries with backoff.                       |
| 503  | `MAINTENANCE`           | Planned downtime                  | Retries with backoff; shows a banner.       |

**Retryable vs terminal matters.** The outbox retries `429`, `5xx`, and network failures forever with backoff. It fails an item permanently on `400`, `403`, `413`, and `422`. Returning `500` for what is really a validation error means the client retries a doomed upload hourly, indefinitely.

---

## 10. Assumptions to confirm

These are **not** decided. The client has picked a default to stay unblocked; each is cheap to change now and expensive later.

| #   | Question                                                     | Client's working assumption                                                     | Why it matters to you                                                                                                                                                                   |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Media retention** — how long is footage kept?              | Indefinite                                                                      | The client deletes its local copy once you confirm completion. If you expire media at 90 days, the user's own history breaks and we need a different local policy.                      |
| 2   | **Max file size**                                            | 200 MB / 60 s video                                                             | Drives the client's recording cap and whether we transcode on-device.                                                                                                                   |
| 3   | **Who triggers review, and which categories auto-publish?**  | Everything enters `pending_review`                                              | If `fire` and `accident` auto-publish for speed, the client needs to say so in the submit confirmation.                                                                                 |
| 4   | **Do comments exist in v1?**                                 | **No.** `counts.comments` is in the shape but the client renders no comment UI. | Adding them later is additive; the feed action rail has the slot reserved.                                                                                                              |
| 5   | **Org seat / pricing model**                                 | Unlimited seats, no in-app billing                                              | If seats are capped or purchasable in-app, the members screen and app-store billing change substantially.                                                                               |
| 6   | **Push payload shape**                                       | `{ incidentId, queryId, title, body }`                                          | The client routes the notification tap by `incidentId`. Confirm before you wire Expo's push service.                                                                                    |
| 7   | **Legal / consent copy before publishing footage of people** | Placeholder text                                                                | **This needs a lawyer, not either of us.** Ghana's Data Protection Act 2012 (Act 843) applies to publishing identifiable people. The client has the screen; the words must be supplied. |
| 8   | **GPS accuracy limit server-side**                           | Client gates at 20 m and flags anything looser as `confidence: "low"`           | Do you reject low-confidence reports, or accept and flag them? The client currently assumes accept-and-flag.                                                                            |
| 9   | **Mocked-location reports**                                  | Accepted, flagged `isMocked: true`                                              | Confirm you want them at all.                                                                                                                                                           |
| 10  | **Account deletion**                                         | `DELETE /me` cascades and anonymises prior reports                              | Interacts with retention and with law-enforcement obligations.                                                                                                                          |

---

## Appendix — endpoint index

| Method                           | Path                                                                     | Auth                |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| `POST`                           | `/devices`                                                               | none                |
| `POST`                           | `/auth/signup`, `/auth/signin`, `/auth/refresh`, `/auth/forgot-password` | none                |
| `POST`                           | `/incidents`                                                             | device, user        |
| `PUT`                            | `/uploads/{id}/chunks/{n}`                                               | device, user        |
| `POST`                           | `/uploads/{id}/complete`                                                 | device, user        |
| `GET`                            | `/uploads/{id}`                                                          | device, user        |
| `GET`                            | `/incidents`, `/incidents/map`, `/incidents/{id}`                        | device, user        |
| `GET`                            | `/me/incidents`                                                          | user                |
| `PATCH`, `DELETE`                | `/incidents/{id}`                                                        | user (author)       |
| `POST`                           | `/incidents/{id}/reactions`, `/incidents/{id}/abuse-reports`             | user                |
| `GET`                            | `/org/dashboard`                                                         | org_member          |
| `GET`, `POST`                    | `/org/queries`                                                           | org_member          |
| `GET`, `PATCH`, `DELETE`         | `/org/queries/{id}`                                                      | org_member          |
| `GET`                            | `/org/queries/{id}/results`, `/org/incidents`                            | org_member          |
| `POST`                           | `/org/incidents/{id}/status`, `/org/incidents/{id}/notes`                | org_member          |
| `POST`, `GET`                    | `/org/exports`, `/org/exports/{id}`                                      | org_member          |
| `GET`, `POST`, `PATCH`, `DELETE` | `/org/members…`                                                          | org_member (admin+) |
| `POST`                           | `/notifications/token`                                                   | device, user        |
| `GET`                            | `/config`                                                                | none                |
