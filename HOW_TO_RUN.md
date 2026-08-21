# How to run this app

## Every day — iPhone

**1. In the project folder:**

```bash
npm run start:go
```

**2. On the iPhone:** open **Expo Go** → tap **GhanaMediaWatch** under _Recently opened_.

Leave the terminal running. Code changes reload onto the phone automatically.

---

### First time only

If the project isn't in _Recently opened_ yet, open Expo Go and type the URL Metro printed:

```
exp://<your-ip>:8081
```

**Don't memorise the IP** — it changes when you reconnect to Wi-Fi. Read it off the terminal each
time. If the phone cannot connect, a stale IP is the usual reason.

### You will never scan a QR code on iOS

The iPhone Camera app cannot open an `exp://` URL — no app claims that scheme, so it reports
"No usable data found". That is expected, not a fault. Type the URL once, then use _Recently opened_
forever after.

---

## Android emulator

```bash
npm run start:go     # then press  a
```

The emulator must already be running. To start one:

```bash
"$ANDROID_HOME/emulator/emulator" -avd Pixel_9
```

> The emulator window can open off-screen. Press **Win + Up** to force it back into view.

---

## When something goes wrong

| Symptom                                                | Cause                                                                                               | Fix                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Port 8081 is being used`                              | A Metro you forgot about is still running                                                           | Use it, or `Ctrl+C` the old terminal first. Only one Metro per port.                                                |
| Phone can't reach the server                           | IP changed since last time                                                                          | Read the fresh URL off the terminal.                                                                                |
| `ngrok tunnel took too long`                           | The tunnel is blocked or slow on this network                                                       | You don't need it. Use the normal LAN URL.                                                                          |
| `Project is incompatible with this version of Expo Go` | Project SDK ≠ Expo Go SDK                                                                           | This project is pinned to **SDK 54** to match App Store Expo Go. Don't upgrade the SDK without checking that first. |
| A screen renders white/blank                           | A `className` referencing a token that no longer exists — NativeWind drops unknown classes silently | `npm test` — `classnames.test.ts` catches these.                                                                    |

---

## Why Expo Go, and what it cannot do

This project is deliberately on **Expo SDK 54**, because the iOS App Store build of Expo Go is
capped there. It also uses **`expo-camera`** rather than `react-native-vision-camera`, because
Expo Go cannot load custom native modules on any SDK.

Two things Expo Go will never do, regardless of configuration:

- **Background uploads.** The outbox drains only while the app is open. A development build is
  needed for true background upload.
- **Shipping to real users.** Expo Go is a development tool. Releasing on iOS still needs a Mac, or
  EAS Build with a paid Apple Developer account.

---

## Checks before committing

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, zero warnings
npm test             # jest
```
