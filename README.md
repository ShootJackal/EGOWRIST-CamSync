# EGO GoProSYNC — TaskFlow Capture

A purpose-built remote for three body-worn GoPro cameras. Built for
ego-centric data collection: collectors wear GoPros on their limbs, hold the
phone, and start / stop all three cameras from one screen.

**Three connection modes — pick the one that matches your situation:**

| Mode | Phone talks to GoPros via | Anything attached to the GoPros? | Where the app runs |
|---|---|---|---|
| **Direct BLE** *(recommended for collection)* | The phone's own Bluetooth | Nothing | Native iOS / Android app (built from this repo) |
| **Mock** | n/a — simulated | Nothing | Anywhere (Vercel web, native, dev) |
| **Bridge** | A Mac on the same Wi-Fi as the cameras | Nothing | Anywhere; Mac runs the bridge |

In Direct BLE mode the phone speaks the
[Open GoPro BLE protocol](https://gopro.github.io/OpenGoPro/ble/) straight to
each camera — no Mac, no cables, no router, no SD-card swap.

---

## Why a native app, not just a Vercel website

The Vercel-hosted web build of this app **cannot** drive GoPros over BLE — iOS
Safari does not implement Web Bluetooth, and even if it did, the GoPro Wi-Fi
HTTP API does not send CORS headers, so a Vercel page can't call it. The web
build is great for showing collectors the UI in mock mode and for stakeholder
demos; for actual collection you build and install the native app on the
phone.

This repo ships both. Same TypeScript, same UI, two outputs:

- `npm run vercel-build` → static web bundle in `dist/` (mock-mode demo).
- `npm run build:ios`    → native iOS app via [EAS Build](https://docs.expo.dev/eas/) (Direct BLE works here).

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Try it in mock mode immediately (no hardware needed)

```bash
npm run web                 # http://localhost:8081
```

Or push to Vercel — `npm run vercel-build` produces `dist/`.
A full step-by-step deploy guide is in `DEPLOY.md`.

### 3. Build the native iOS app for real BLE control

```bash
npm install -g eas-cli
eas login
eas build:configure
npm run build:ios          # builds in the cloud, ~15 min
```

EAS will email you a `.ipa` link. Install it on the iPhone via TestFlight or
Apple Configurator. Open the app → **Settings → Direct BLE → Pair Cameras**.

(See `TESTING.md` for the full step-by-step.)

---

## Direct BLE mode — how it works

```
[ iPhone (native app) ]
          │
          │  Bluetooth LE  (Open GoPro BLE — service FEA6, char b5f9-0072)
          ├───────────────────▶  GoPro 1
          ├───────────────────▶  GoPro 2
          └───────────────────▶  GoPro 3
```

The app maintains one BLE connection per camera, sends the
[Set Shutter](https://gopro.github.io/OpenGoPro/ble/features/control.html#set-shutter)
command (ID `0x01`) to start and stop, polls
[Get Status Values](https://gopro.github.io/OpenGoPro/ble/features/query.html)
for battery / SD / encoding, and sends a Keep Alive every 3 s so the cameras
don't sleep. Recording sessions are tracked locally with the cross-camera
*command spread* — the wall-clock difference between the first and last
camera responding to Start All — visible in the recording banner.

### Camera support

Open GoPro BLE works on Hero 9, 10, 11, 11 Mini, 12, 13, Max, Max 2, and
Lit Hero. The app pairs with each camera once; subsequent connections are
automatic.

### Pairing each camera (one-time per phone)

On each GoPro:

1. **Preferences → Connections → Connect Device → GoPro Quik App**
2. The camera will advertise as `GP24500001` (or similar — its serial).

In the app:

1. **Settings → Direct BLE → Pair Cameras**.
2. Tap **Assign** next to GoPro 1, then tap the camera name in the scan
   results. Repeat for GoPro 2 and 3.
3. Optionally rename each slot to "Left Wrist", "Helmet", etc.
4. Go back to **Capture** → **Connect All** → **Start All**.

iOS will store the BLE bond, so future launches connect without re-pairing.

---

## Bridge mode — when to use it

If you specifically need a *desktop browser* on a Mac to drive the cameras
(scripting, multi-display setups, etc.), the Express bridge in
`server/bridge/` still works exactly as before. See `TESTING.md` for the
bridge workflow. For ego-centric mobile collection, ignore the bridge
entirely — Direct BLE is simpler and has no extra moving parts.

---

## Mock mode

Everything works without hardware. Use it for:

- Showing collectors the UI before a session.
- Debugging the dashboard layout.
- Verifying CI / Vercel deployments.

```bash
npm run web                  # local
# or just open the Vercel URL in any browser
```

In **Settings → Connection Mode**, pick **Mock**.

---

## Repository layout

```
app/
  capture/
    index.tsx          ← main dashboard (pre-flight gate, pull-to-refresh, haptics)
    settings.tsx       ← connection mode + pairing entry point
    pair.tsx           ← BLE scan + per-slot assignment (native only)
    logs.tsx           ← session history
    camera/[id].tsx    ← per-camera detail
components/capture/    ← UI components
lib/capture/
  api.ts               ← unified facade over the 3 clients
  bleClient.ts         ← Open GoPro BLE implementation (native)
  bridgeClient.ts      ← HTTP/WebSocket client for the Mac bridge
  mockBridgeClient.ts  ← in-process simulation
  preflight.ts         ← readiness check (battery, storage, connection)
  haptics.ts           ← native haptic feedback (no-op on web)
  types.ts
  storage.ts
  formatting.ts
server/bridge/         ← optional Mac bridge (Express + WebSocket)
```

---

## Commands

```bash
# Native (Direct BLE)
npm run build:ios          # EAS production-ish iOS build (.ipa)
npm run build:ios:dev      # Dev client build for iterative work
npm run build:android      # Android equivalent

# Web / Vercel
npm run web                # Expo dev server, web target
npm run build:web          # Same as vercel-build
npm run vercel-build       # Static web bundle in dist/

# Bridge (only if you actually want to use the Mac bridge)
npm run bridge:install
npm run bridge

# Quality
npm run typecheck
```

---

## Vercel deployment

Two-line summary; the long-form deploy guide is in `DEPLOY.md`.

```
Build command:    npm run vercel-build
Output directory: dist
```

Optional env var: `EXPO_PUBLIC_DEFAULT_BRIDGE_URL` to pre-fill the bridge URL
in Settings.

---

## Bridge API (only relevant in bridge mode)

See `server/bridge/src/index.ts`. REST + WebSocket; identical contract to
what the Direct BLE and Mock clients expose:

`/api/health`, `/api/cameras`, `/api/cameras/:id/{connect,disconnect,start,stop,status}`,
`/api/cameras/{connect,start,stop,status}-all`, `/api/sessions/active`, `/api/sessions`,
`ws://…/ws`.
