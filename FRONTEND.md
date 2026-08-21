# Frontend Architecture — GhanaMediaWatch

**Audience:** anyone who needs to understand the mobile client without working on it — most
immediately the backend engineer, as the companion to [`API_CONTRACT.md`](./API_CONTRACT.md).

**Honesty about status:** this describes the client as designed. Only Phase 1 is built today.
Every section below is marked **Built** or **Specified**, and you should not assume a Specified
component exists yet.

| Phase | Scope                                              | Status                         |
| ----- | -------------------------------------------------- | ------------------------------ |
| 1     | Scaffold, tooling, design system, tab shell        | **Built**                      |
| 2     | Types, `ApiClient`, `MockApiClient`, API contract  | Contract written; code pending |
| 3     | Local DB + sync engine                             | Specified                      |
| 4     | Capture flow (GPS gate → camera → review → outbox) | Specified                      |
| 5     | Feed, map, incident detail                         | Specified                      |
| 6     | Auth and profile                                   | Specified                      |
| 7     | Org / institution tier                             | Specified                      |
| 8     | Polish: states, a11y, i18n, performance            | Specified                      |

---

## 1. What the client is responsible for

The division of labour matters, because several things the server might expect to handle are
already solved on the device.

**The client owns:** media capture, the GPS gate, local persistence of captured media and metadata,
the outbox queue and its state machine, retry scheduling and backoff, background upload
continuation, connectivity detection, Wi-Fi-only deferral, chunk resumption bookkeeping, and all
rendering of vetting state and privacy flags.

**The server owns:** durable storage, vetting decisions, the public feed, clustering, org queries,
authorisation, and abuse handling.

**Both own:** display-flag enforcement. See [§7](#7-privacy-enforcement) — this is deliberate
duplication, not redundancy.

---

## 2. Stack

| Concern      | Choice                         | Version               | Why not the alternative                                                                                                                                        |
| ------------ | ------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | Expo (managed + dev client)    | SDK 57                | Declarative native config while still allowing custom native modules.                                                                                          |
| Runtime      | React Native, New Architecture | 0.86.2 / React 19.2.3 | —                                                                                                                                                              |
| Routing      | Expo Router, typed routes      | 57.0.14               | File-based routing keeps route files thin; typed routes catch broken links at compile time.                                                                    |
| Styling      | NativeWind v4 + Tailwind v3    | 4.2.6                 | One styling language app-wide. NativeWind v5 is still preview.                                                                                                 |
| Client state | Zustand                        | 5.0.15                | Capture session, upload queue and filters are small, imperative, and read from **non-React code** (the sync engine). Redux Toolkit is heavier than this needs. |
| Server state | TanStack Query                 | 5.101.4               | Caching, pagination and offline persistence are the whole problem; hand-rolling them is the mistake.                                                           |
| Local DB     | expo-sqlite + Drizzle          | 0.45.2                | The outbox is a real relational queue with a state machine. AsyncStorage would mean hand-rolled indexing over JSON blobs.                                      |
| Camera       | react-native-vision-camera     | 5.2.2                 | Finer control over photo/video format, torch and frame quality than `expo-camera`.                                                                             |
| Lists        | @shopify/flash-list            | 2.0.2                 | Feed and outbox must hold 60 fps on mid-range Android.                                                                                                         |
| Forms        | react-hook-form + zod          | 7.85 / 4.4.3          | One schema drives both validation and the TS types on the submit payload.                                                                                      |
| i18n         | i18next                        | 26.3.6                | English only today, structured for a second locale from day one.                                                                                               |

**TypeScript is strict**, with `noUncheckedIndexedAccess` and `noUnusedLocals`. `any` is an ESLint
**error**, not a warning.

---

## 3. Repository structure — _Built_

```
src/
  app/                 expo-router routes only — thin, they compose feature components
  features/
    capture/           GPS gate, camera, review, metadata editor
    feed/              vertical pager
    outbox/            offline queue UI + sync engine
    incident/          detail view, map, navigation handoff
    org/               institution / business tier
    auth/  settings/
  components/ui/       design-system primitives
  api/                 ApiClient interface, MockApiClient, HttpApiClient
  db/                  drizzle schema, migrations, repositories
  services/            location, camera permissions, device identity, sync, media
  stores/              zustand stores
  hooks/  types/  lib/  i18n/
```

Two rules hold this together:

1. **Route files contain no business logic.** They import a feature component and render it.
2. **Cross-feature imports go through `components/ui`, `services`, or `types` only.** `features/feed`
   never imports from `features/capture`.

---

## 4. The API layer — _Specified_

Every screen is built against a single swappable interface, `ApiClient`, with two implementations
selected by one environment variable:

```
EXPO_PUBLIC_API_MODE=mock   →  MockApiClient   seeded fixtures, artificial latency,
                                               injectable failure rate, no backend needed
EXPO_PUBLIC_API_MODE=http   →  HttpApiClient   real calls to EXPO_PUBLIC_API_URL
```

This is why frontend work never blocks on the backend, and why the contract in
`API_CONTRACT.md` is already exercised end to end before a server exists.

**Consequence for the backend:** the client never constructs a request inline in a component. If
your implementation needs to differ from the contract, the change lands in exactly one file.

---

## 5. Core flow — the GPS gate — _Specified_

The defining feature. **The camera preview does not mount until a location fix meets the accuracy
threshold.** This is a hard gate, not a warning.

```
  entering capture
        │
        ▼
  watchPositionAsync(BestForNavigation)
        │
        ├─ permission denied ──────► explainer + deep link to system settings
        ├─ location services off ──► prompt to enable
        │
        ▼
  acquiring ── accuracy readout, pulse indicator, live lat/long at 6 dp
        │
        ├─ accuracy ≤ 20 m ────────► CAMERA MOUNTS (haptic confirmation)
        │
        └─ stalled > 30 s ─────────► "move to an open area" coaching
                                     └─ optional escape hatch:
                                        proceed with location_confidence: "low"
```

| Constant                      | Value  | Rationale                                                                                                                                                              |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GPS_ACCURACY_THRESHOLD_M`    | 20     | About the best a consumer phone achieves outdoors within a few seconds. Tighter feels broken in urban canyons; looser is useless for dispatching someone to the scene. |
| `GPS_STALL_TIMEOUT_MS`        | 30 000 | When coaching and the escape hatch appear.                                                                                                                             |
| `GPS_ABSOLUTE_MAX_ACCURACY_M` | 150    | Beyond this, not offered even via the escape hatch.                                                                                                                    |
| `MAX_VIDEO_DURATION_S`        | 60     | Enforced client-side with a ring countdown.                                                                                                                            |

**The fix is locked at the moment of capture** and does not keep updating afterwards.

**Tamper signals captured alongside it:** `accuracyM`, `altitude`, `heading`, `speed`,
`capturedAtIso` (device clock), `capturedAtUtcOffsetMinutes`, `deviceUptimeMs`, and `isMocked` on
Android. The reduced-accuracy escape hatch flags the report — it never silently downgrades it, and
the flag is visible in the UI as well as in the payload.

---

## 6. Core flow — offline-first sync — _Specified_

**The network is treated as absent by default. Capture always succeeds locally.**

On capture the client writes the media file to `documentDirectory/incidents/` — never the cache
directory, which the OS can evict — and inserts a row in the local `incidents` table. Only when
both succeed does the UI report success.

### Local record state machine

```
  draft ──► queued ──► uploading ──► uploaded
                          │
                          └──► failed ──► (retry) ──► queued

  any state ──► cancelled   (terminal, user-initiated)
```

Persisted per row: `attemptCount`, `lastError`, `nextRetryAt`, `serverId`, `bytesUploaded`.

### Retry schedule

| Attempt | Delay              |
| ------- | ------------------ |
| 1       | 2 s                |
| 2       | 8 s                |
| 3       | 30 s               |
| 4       | 2 min              |
| 5       | 10 min             |
| 6+      | 1 h (cap, repeats) |

Plus ±25 % jitter, to avoid a thundering herd when a cell tower comes back and a thousand phones
retry simultaneously. `Retry-After` from a `429` overrides the schedule.

### Drain rules

- Subscribes to NetInfo; drains when `isInternetReachable === true` — **not merely `isConnected`**,
  which is true on a captive-portal Wi-Fi that goes nowhere.
- Oldest first, one item at a time.
- A background task via `expo-task-manager` continues uploads when the app is backgrounded.
  **iOS background execution is opportunistic and not guaranteed** — the app also resumes draining
  on foreground, and this is documented rather than assumed away.
- **Wi-Fi-only toggle** defers _video_ uploads to Wi-Fi. Photos still go over mobile data. The
  outbox shows what is waiting and why.

### Deletion

The local media file is deleted **only after the server confirms completion**. The metadata row is
kept, with `serverId`, so the user retains a personal history.

> This is why media retention is question 1 in the contract's open questions. If the server expires
> footage the client has already deleted locally, the user's history points at nothing.

---

## 7. Privacy enforcement — _Specified_

Three booleans per report: `showLocation`, `showDate`, `showTime`.

**The client enforces these independently of the server**, and has unit tests asserting a hidden
value never appears in rendered output. The server enforcement described in `API_CONTRACT.md` §7 is
the other half.

Both layers are required, and the reason is worth stating plainly: client-side hiding alone means
true coordinates travel to every phone that scrolls past the report and sit in an inspectable
cache. Server-side alone means one client bug leaks them.

The review screen shows a **live public preview** — exactly what a stranger will see — so the
reporter is never guessing.

### Anonymous mode

A prominent toggle with an honest explainer sheet. The copy states that anonymous means the public
and other users see no profile, **but a device identifier is still attached** for abuse prevention
and accountability. The client deliberately does not overstate the guarantee.

`deviceId` is **never rendered in the public UI**, on any screen.

---

## 8. Device identity — _Specified_

- A **UUID v4** generated on first launch, persisted in `expo-secure-store`. This is the primary
  identifier, sent as `X-Device-Id` on every request.
- Supplemented by `Application.getAndroidId()` / `getIosIdForVendorAsync()` as a secondary field.
- **Both platform IDs reset on uninstall or factory reset and are not stable identifiers.** The
  SecureStore UUID is the primary; the platform ID is a weak correlation signal only.

---

## 9. Design system — _Built_

Tokens live as CSS custom properties in `global.css`, surfaced as Tailwind utilities in
`tailwind.config.js`. Components never hardcode a hex value; the only mirror is `src/lib/theme.ts`,
for the few RN APIs that take colours as props rather than styles.

**The palette is tuned for a 70-year-old reader**, which drove some non-obvious choices:

- **Light by default, not dark.** Intraocular light scatter roughly doubles between age 20 and 70,
  so white-on-black haloes badly. Dark mode is a young-eye preference.
- **WCAG AAA (7:1) for body text**, not AA — contrast sensitivity falls sharply after 60. Solved
  against the _elevated_ surface, the worst case.
- **Warm paper `#FAF6F0`, not pure white** — `#FFFFFF` at phone brightness causes veiling glare.
- **Warm hues.** The aging lens yellows and absorbs short wavelengths, so blues muddy. Blue never
  carries meaning alone.
- **17px body type, 48pt tap targets.**

Dark mode exists, softened at both ends, and is used on media surfaces regardless of scheme —
a light frame would wreck the footage.

**Category colours** are grouped into families so hue signals the _kind_ of incident and the label
says which one. Colour is a secondary cue: twelve hues cannot be reliably distinguished by an older
eye, so every chip carries a text label and every map pin gets a distinct icon.

All of this is **enforced by tests** (`src/lib/__tests__/palette.test.ts`, 33 assertions), not just
documented — a later "soften that grey" fails CI.

---

## 10. Quality bar — _partly Built_

- **Accessibility** — `accessibilityLabel` and `accessibilityRole` on every interactive element;
  the capture flow announces accuracy changes and gate state to screen readers; reduced motion
  respected; system font scaling supported up to 2× without breaking layout.
- **i18n** — every user-facing string goes through i18next from day one. No hardcoded strings.
- **Every list has three designed states** — skeleton, empty, error. A bare spinner is never an
  acceptable empty state.
- **Error handling** — a root error boundary plus per-screen boundaries, typed error objects from
  the API layer, and toasts that say what happened and what to do next. **A raw stack trace is
  never shown to a user.**
- **Testing** — Jest + React Native Testing Library. Priority targets are the sync engine state
  machine, the GPS gate logic, the outbox reducers, and the display-toggle rendering rules.

---

## 11. Running it

Native modules mean **Expo Go will not work** from Phase 4 onward; a development build is required.

```bash
npm install
npx expo prebuild --platform android
npm run android            # first build 10–20 min; later builds incremental
npm start                  # JS-only changes need no rebuild
```

iOS requires a Mac. Android minSdk 26, iOS deployment target 16.4 (Expo SDK 57 minimum).

| Script              | Does                            |
| ------------------- | ------------------------------- |
| `npm run typecheck` | `tsc --noEmit`                  |
| `npm run lint`      | ESLint, zero warnings tolerated |
| `npm test`          | Jest                            |

CI gate for every phase: `npm run typecheck && npm run lint && npm test`.

---

## 12. Known constraints

1. **`react-native-vision-camera` v5 ships no Expo config plugin.** Camera and microphone
   permissions are declared directly in `app.json` rather than through a plugin block. Re-check if
   the library restores one.
2. **`react-dom` is pinned to 19.2.3 via `overrides`** — `expo-router` → `@expo/ui` → `vaul` floats
   it past Expo's pinned `react` and breaks npm peer resolution.
3. **React Native cannot synthesise font weights from one custom family on Android.** Each Inter
   weight is registered as its own family: `font-sans`, `font-sans-medium`, `font-sans-semibold`,
   `font-sans-bold`, `font-display`.
4. **Testing Library v14 made `render` and `fireEvent` async.** Tests must `await` them.
5. **Emulators report a perfect, mocked GPS fix** — precisely the branch the gate is built to
   detect. The capture flow needs a physical device to test meaningfully.

---

## 13. What the backend engineer should take from this

- The client is **offline-first and retries forever**. Assume duplicates; implement idempotency.
- The client **already backs off** on `429` and `5xx`. Return the right status and it behaves.
  Return `500` for a validation error and every affected phone retries hourly, indefinitely.
- The client **deletes local media on upload completion**. Retention policy on your side is not an
  internal detail — it changes what the user can see in their own history.
- The client **enforces display flags too**, but that is defence in depth, not permission to send
  suppressed values.
- The client is built against **one swappable interface**. Contract changes are cheap now and
  expensive after the screens exist. Raise them early.
