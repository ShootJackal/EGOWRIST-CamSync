# TESTING — Getting EGO GoProSYNC Ready for Field Use

Goal: a collector wears three GoPros on their limbs, holds an iPhone, opens
this app, and starts/stops all three cameras at once. **Nothing physically
attached to the GoPros — pure Bluetooth from the phone.**

This is the same workflow as
[Camera Tools for GoPro Heros](https://www.toolsforgopro.com/cameratools).

There are three stages. Stage 0 needs nothing. Stage 1 needs the cameras.
Stage 2 is the actual collection-day rehearsal.

---

## Stage 0 — UI walk-through in mock mode (no hardware)

Use this to show collectors the app and to verify deploys.

```bash
npm install
npm run web        # http://localhost:8081
```

Or just open the Vercel URL on a phone. **Settings → Connection Mode → Mock**.
Walk through Connect All / Start All / Stop All. The recording session banner
shows a live timer; the Logs tab records every session.

---

## Stage 1 — Native iOS build with Direct BLE (the real thing)

This is the *only* mode that gives you "no Mac, no cables, just the phone".
You must build a native iOS app from this repo — Web Bluetooth doesn't exist
on iOS Safari, so the Vercel page can't do it.

### 1.1 One-time EAS setup (on a Mac, Linux, or Windows machine — not the phone)

```bash
npm install -g eas-cli
eas login                 # prompts for your Expo account
eas build:configure       # uses the eas.json already in the repo
```

If you don't have an Apple Developer account ($99/year), you can still build
an internal-distribution app — `eas` will walk you through the Apple sign-ins.

### 1.2 Build the app

```bash
npm run build:ios         # ~10–20 min; runs in EAS cloud, not on your machine
```

When it finishes, `eas` shows a download URL and an **install** link.

Three install options, easiest first:

- **TestFlight** (best for collectors who already have the TestFlight app).
  `eas submit -p ios --latest --non-interactive` after the build.
- **Direct install on the iPhone**: open the install URL in Safari **on the
  iPhone**, tap "Install".
- **Apple Configurator** (Mac only): drag the `.ipa` onto a connected iPhone.

### 1.3 First launch on the iPhone

1. Open the app.
2. iOS will ask for **Bluetooth permission** — tap **Allow**. (This corresponds
   to the `NSBluetoothAlwaysUsageDescription` in `app.json`.)
3. **Settings tab → Connection Mode → Direct BLE**.
4. The "Direct BLE" banner should turn blue and say *"Phone is talking to
   GoPros directly — no Mac, no cables"*. If it says *"not supported here"*
   you're in the web build, not the native build.

### 1.4 Pair each GoPro (one-time per phone, per camera)

For **each** of the three GoPros:

1. On the camera: **Preferences → Connections → Connect Device → GoPro Quik App**.
   The camera shows a screen waiting for connection.
2. In the app: **Settings → Pair Cameras**.
3. Tap **Assign** next to **GoPro 1**.
4. Tap **Scan for GoPros**. Wait ~5 s. The camera appears as `GP24500001` (or
   similar — the camera's serial/MAC).
5. Tap that result → it's now bound to slot 1.
6. Repeat for slots 2 and 3.

iOS stores the BLE bond. Future launches connect without re-pairing as long as
the cameras are powered on.

### 1.5 Smoke test all three

In the **Capture** tab:

1. Tap **Connect All** → all three cards turn green within ~3 seconds.
2. Tap **Start All** → red dots come on **on all three actual GoPros**;
   the app banner shows the live recording timer.
3. The banner also shows **"X ms command spread across cameras"** — for ego
   collection you generally want this < 500 ms.
4. Tap **Stop All** → red dots go off; the session moves to **Logs**.
5. Open the GoPros' SD cards (or their Quik app) and confirm the new clip
   exists on each.

### 1.6 Per-camera tests (any one camera)

Tap a camera card → **Camera Detail screen**. Confirm:

- Battery percentage matches what the GoPro screen shows.
- Storage bar fills proportionally to the camera's used space.
- **Refresh** updates the values.
- **Disconnect** then **Connect** cycle works.

---

## Stage 2 — Collection-day rehearsal

Day before the real shoot:

- [ ] All three GoPros charged > 90%.
- [ ] All three SD cards reformatted in-camera, > 90% free.
- [ ] All three GoPros on the latest firmware.
- [ ] All three are paired in the app (Settings → Pair Cameras shows three
      green slots).
- [ ] Open Capture tab, hit **Connect All**, confirm three green cards.
- [ ] Hit **Start All**, walk around the room with the phone, hit **Stop All**.
      Confirm clips on all three SD cards.
- [ ] iPhone is charged and on Do-Not-Disturb (avoids interruptions during
      the run).
- [ ] If you're outdoors, BLE range is realistic — typical Class-2 BLE is
      ~10 m line-of-sight. With the phone in the collector's pocket and the
      GoPros on their limbs, every camera is within arm's length, so this is
      not a concern.

On collection day, in this order:

1. Power on all three GoPros (long-press Mode).
2. Open the app.
3. **Connect All** (the app does this automatically on launch if the cameras
   are awake).
4. When the collector is in position: **Start All**.
5. After the run: **Stop All**.
6. Verify the session in the **Logs** tab.

---

## Stage 3 (optional) — Bridge mode for desktop control

If for some reason you specifically need a **desktop browser** (Mac with
keyboard) to drive the cameras instead of the iPhone, the legacy Express
bridge in `server/bridge/` still works. This is rarely what you want for
ego-centric capture; it requires either USB-C cables to all three cameras or
having all three GoPros joined to your local Wi-Fi router. The previous
revision of this guide documented that path in detail; use it only if Direct
BLE turns out to be insufficient for your specific multi-collector setup.

```bash
cd server/bridge
cp .env.example .env
npm install
npm run dev               # http://localhost:4000
```

Then in the app: **Settings → Local LAN** → bridge URL → **Test Connection**.

---

## Common issues (Direct BLE)

| Symptom | Cause | Fix |
|---|---|---|
| **"Direct BLE not supported here"** in Settings | You opened the Vercel URL in a browser, not the native app | Install the EAS-built iOS app on the phone |
| Pair Cameras → Scan finds nothing | Cameras not in pairing mode, or iOS Bluetooth permission not granted | Re-do *Connect Device → GoPro Quik App* on each camera; check iPhone Settings → Privacy → Bluetooth → EGO GoProSYNC |
| Pairing succeeds, Connect fails with "Camera disconnected" | Camera went to sleep between pairing and connect | Wake the camera (Mode button); the app sends Keep Alive every 3 s while connected |
| Start All only starts 2 of 3 | Third camera lost BLE link (out of range, low battery) | Tap **Refresh** on that camera card; if it stays red, reconnect |
| Big command spread (>2 s) | iOS BLE stack serializes connections to the same controller; with 3 simultaneous writes the third can be slow | Generally fine for body-mounted ego data; if you need sub-100ms sync, run a local time-sync clap at the start of each session and rely on post-hoc alignment |
| Battery drains very fast on the phone | BLE central + 3 connections + keep-alive at 3 s is genuinely heavy | Plug the phone into a battery pack between sessions |

---

## Sanity-check checklist (paste into your shoot notes)

```
[ ] App opens, banner says "Direct BLE"
[ ] Settings → Pair Cameras: 3 green slots, all named
[ ] Connect All → 3 green cards
[ ] Start All → 3 red dots on the GoPros, banner shows live timer
[ ] Stop All → session in Logs tab
[ ] Verified .MP4 on each SD card
```
