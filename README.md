# GhanaMediaWatch — Incident Reporting App (Frontend)

A mobile app for capturing and transmitting incidents of public interest. Media is captured
**only once an accurate GPS fix is locked**, stored locally first, and uploaded automatically when
connectivity returns. Reports are vetted before appearing on a TikTok-style public feed.

**This repository is the client only.** There is no backend here by design.

- [`API_CONTRACT.md`](./API_CONTRACT.md) — the full contract the backend must implement.
- [`FRONTEND.md`](./FRONTEND.md) — how the client is built, and what it handles so the server
  does not have to.

Shareable web versions for handing to the backend engineer:
[Backend Spec](https://claude.ai/code/artifact/1ddffd31-c15a-4846-b0f2-132029b7d30f) ·
[Frontend Architecture](https://claude.ai/code/artifact/bf0e1af8-421c-4c57-8702-70df56b6712e).
HTML and PDF copies of both sit at the repo root; they are generated from the Markdown, so edit
the Markdown and regenerate rather than editing them directly.

---

> **Just want to run it?** See [`HOW_TO_RUN.md`](./HOW_TO_RUN.md) — two commands.

## Status

| Phase | Scope                                                  | State   |
| ----- | ------------------------------------------------------ | ------- |
| 1     | Scaffold, tooling, design system                       | ✅ Done |
| 2     | Types, `ApiClient`, `MockApiClient`, `API_CONTRACT.md` | ⏳ Next |
| 3     | Local DB + sync engine (+ unit tests)                  | —       |
| 4     | Capture flow (GPS gate → camera → review → outbox)     | —       |
| 5     | Feed, map, incident detail                             | —       |
| 6     | Auth and profile                                       | —       |
| 7     | Org / institution tier                                 | —       |
| 8     | Polish: states, a11y, i18n, performance                | —       |

---

## Running it

### Fast path — Expo Go (works today, ~1 minute)

Nothing in the app _currently_ imports a module outside Expo Go, so until the capture flow lands in
Phase 4 you can preview the shell with no native build:

```bash
npm run start:go
```

Install **Expo Go** on an Android phone, scan the QR code. This stops working the moment Phase 4
adds Vision Camera — it is a preview convenience, not the real workflow.

### Real path — Android development build

Native modules (Vision Camera, Maps, background tasks) mean a dev build is required from Phase 4
onward. iOS needs a Mac; Android works on Windows.

**One-time environment setup.** Expo needs to find the JDK and the Android SDK:

```powershell
# PowerShell — one time, then reopen the terminal
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
```

**Then, each time:**

```bash
npx expo prebuild --platform android   # regenerates android/ — only after native config changes
npm run android                         # builds, installs, and starts Metro
```

The first build takes 10–20 minutes (Gradle downloads and NDK compilation). Later builds are
incremental and much faster. If only JS changed, skip the rebuild entirely and just run `npm start`.

**Need a device.** Either plug in an Android phone with USB debugging on, or start an emulator:

```bash
"$ANDROID_HOME/emulator/emulator" -avd Pixel_9 &
adb devices                             # confirm it shows up before building
```

> The emulator has no real camera or GPS. It is fine for the feed, outbox, and org tier, but the
> GPS gate and capture flow need a physical device to be meaningfully testable — an emulator
> reports a mocked, perfectly accurate fix, which is exactly the branch the gate is designed to
> flag.

### Troubleshooting

**`INSTALL_FAILED_INSUFFICIENT_STORAGE` on an emulator.** The all-ABI debug APK is ~300 MB
(four architectures, unstripped) and installing needs roughly double that free. Build only the
architecture the target actually uses:

```bash
# emulator (x86_64) — check with: adb shell getprop ro.product.cpu.abi
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64

# physical phone (almost always arm64-v8a)
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

That drops the APK to roughly a quarter of the size and builds faster. Worth doing routinely, not
just when an install fails.

**`CommandError: Install @expo/ngrok and try again`** despite it installing successfully. Expo CLI
cannot resolve globally-installed packages on Windows. Install it locally instead — it is already
in this project's devDependencies, so `npx expo start --tunnel` works after `npm install`.

**QR code scans but nothing opens.** `npm start` runs `--dev-client`, whose QR encodes a custom
scheme that only resolves if the development build is installed on that device. Either install the
dev build first, or use `npm run start:go` with Expo Go.

### Verified toolchain on this machine

| Component        | Found                                                       |
| ---------------- | ----------------------------------------------------------- |
| JDK              | 21.0.8 (bundled with Android Studio, `jbr/`)                |
| Android SDK      | `android-36` platform, build-tools 35.0.0 / 36.0.0 / 36.1.0 |
| Emulators        | `Pixel_9`, `Medium_Phone_API_36.1`                          |
| New Architecture | enabled, Hermes on                                          |

### Backend

The app boots against `MockApiClient` by default, so it runs end to end with no backend.
Copy `.env.example` to `.env` to change that:

```
EXPO_PUBLIC_API_MODE=mock     # mock | http
EXPO_PUBLIC_API_URL=http://localhost:4000
```

---

## Stack

| Concern      | Choice                                           | Why not the alternative                                                                                                                                   |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | Expo SDK 57, React Native 0.86, New Architecture | Managed workflow + `expo-dev-client` keeps native config declarative while still allowing custom native modules.                                          |
| Routing      | Expo Router (typed routes)                       | File-based routing keeps route files thin; typed routes catch broken links at compile time.                                                               |
| Styling      | NativeWind v4 + Tailwind v3                      | One styling language across the app. NativeWind v5 is still preview.                                                                                      |
| Client state | Zustand                                          | Capture session / upload queue / filters are small, imperative, and read from non-React code (the sync engine). Redux Toolkit is heavier than this needs. |
| Server state | TanStack Query                                   | Caching, pagination, and offline persistence are the whole problem; hand-rolling them is the mistake.                                                     |
| Local DB     | expo-sqlite + Drizzle                            | The outbox is a real relational queue with a state machine. AsyncStorage would mean hand-rolled indexing over JSON.                                       |
| Camera       | react-native-vision-camera                       | Finer control over photo/video format, torch, and frame quality than `expo-camera`.                                                                       |
| Lists        | `@shopify/flash-list`                            | Feed and outbox must hold 60 fps on mid-range Android.                                                                                                    |
| Forms        | react-hook-form + zod                            | One schema drives both validation and the TS types on the submit payload.                                                                                 |

### Dependency notes

- **`clsx` + `tailwind-merge`** — `cn()` merges class strings so primitives accept a `className`
  override without specificity fights. Hand-rolled string concat silently keeps both conflicting
  classes; `tailwind-merge` resolves them by Tailwind's own precedence.
- **`@expo-google-fonts/inter`** — ships the font files in-repo. Rejected: fetching a webfont at
  runtime (first paint would flash a system face and the app must work offline).
- **No bottom-sheet library.** Every sheet here is a fixed-height explainer or action list with no
  snap points or drag gestures, so `@gorhom/bottom-sheet` buys nothing. `Sheet` is built on RN's
  `Modal`.

---

## Architecture

```
src/
  app/           expo-router routes only — thin, they compose feature components
  features/      capture · feed · outbox · incident · org · auth · settings
  components/ui  design-system primitives
  api/           ApiClient interface + Mock and Http implementations
  db/            drizzle schema, migrations, repositories
  services/      location, camera permissions, device identity, sync, media
  stores/        zustand stores
  hooks/  types/  lib/  i18n/
```

Feature folders are self-contained. **Cross-feature imports go through `components/ui`,
`services`, or `types` only** — never `features/a` importing from `features/b`.

---

## Design system

**Designed for a 70-year-old reader.** That single decision drives the whole palette, and it
inverts the usual "dark-first media app" instinct. Three facts about an aging eye:

| Fact                                                            | Consequence in this app                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intraocular light scatter roughly **doubles** between 20 and 70 | White-on-black _haloes_ and smears. So the app is **light by default**, and the dark palette softens both ends (`#17140F` / `#F7F2E9`) instead of maximising contrast. |
| Contrast sensitivity falls sharply after 60                     | Body text targets **WCAG AAA (7:1)**, not AA. Every semantic colour was solved for 7:1 against the _elevated_ surface — the worst case, not the easy one.              |
| The lens yellows, absorbing short wavelengths                   | Hues skew **warm**; blue is never the sole carrier of meaning. Category colours are checked against a simulated 70-year-old lens.                                      |

Surfaces are **warm paper** (`#FAF6F0`), not pure white — `#FFFFFF` at phone brightness causes
veiling glare for a scattering lens. The accent is a **terracotta** (`#902A0B`): warm hues stay
vivid through a yellowed lens, and it reads as inviting rather than clinical. Body type is **17px**
with 1.55 line height, and the minimum tap target is **48pt**, not 44 — grip precision declines
with age too.

Dark mode still exists and is used automatically on media surfaces (feed pager, camera, full-screen
viewer), where a light frame would wreck the footage.

**Category colours** are grouped into families — emergency reds, civic golds, environment greens,
then water/crime/health — so the hue tells you the _kind_ of incident and the label tells you which
one. Colour is deliberately a **secondary cue**: twelve hues cannot be told apart reliably by an
older eye, so every chip carries a text label and every map pin gets a distinct icon. Measured
minimum separation is ΔE 23.6 in normal vision and ΔE 18.1 through the aged-lens simulation
(up from 15.2 / 12.7 before this pass).

All of this is **enforced by a test**, not just documented — see
[`src/lib/__tests__/palette.test.ts`](./src/lib/__tests__/palette.test.ts). A later "let us soften
that grey" tweak fails CI rather than silently making the app unreadable for its target reader.

Tokens live as CSS custom properties in [`global.css`](./global.css) and surface as Tailwind
utilities in [`tailwind.config.js`](./tailwind.config.js). **Never hardcode a hex value in a
component.** The one sanctioned mirror is [`src/lib/theme.ts`](./src/lib/theme.ts), for the handful
of RN APIs that take colours as props rather than styles (`StatusBar`, `ActivityIndicator`,
`Switch`, vector icons, map markers, gradient stops).

**Fonts.** React Native cannot synthesise weights from one custom family on Android — `fontWeight`
only picks a face the OS knows about. So each Inter weight is registered as its own family and
exposed as a distinct utility: `font-sans`, `font-sans-medium`, `font-sans-semibold`,
`font-sans-bold`, `font-display`. These deliberately avoid Tailwind's own `font-medium` /
`font-semibold` weight utilities to prevent class-name collisions.

**Every list has three designed states** — skeleton, empty, error — via `SkeletonList`,
`EmptyState`, `ErrorState`. A bare spinner is never an acceptable empty state.

---

## Platform notes and known constraints

- **`react-native-vision-camera` v5 no longer ships an Expo config plugin.** Camera and microphone
  permissions are therefore declared directly in `app.json` (`android.permissions` and
  `ios.infoPlist`) rather than through a plugin block. Re-check this if the library restores one.
- **`react-dom` is pinned to `19.2.3` via `overrides`.** `expo-router` → `@expo/ui` → `vaul` pulls in
  `react-dom`, which floats to a newer patch than Expo's pinned `react` and breaks npm peer
  resolution.
- **iOS deployment target is 16.4**, the minimum for Expo SDK 57.
- **Testing Library v14 made `render` and `fireEvent` async.** Every test must `await` them or
  queries run before React commits.

---

## Scripts

```bash
npm start          # Metro for the dev client
npm run android    # build + install the Android dev build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint, zero warnings tolerated
npm run format     # prettier --write
npm test           # jest
```

CI gate for every phase: `npm run typecheck && npm run lint && npm test`.
