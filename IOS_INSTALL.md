# Getting EGO GoProSYNC onto an iPhone for real BLE control

The whole point is to control three GoPros over Bluetooth from one phone with
nothing strapped to the cameras. That requires a **native iOS app** because:

- iOS Safari does not implement Web Bluetooth — a webpage cannot talk to BLE
  devices on iOS at all.
- Expo Go can't be used either — it only includes the Expo SDK modules, not
  custom native libraries like `react-native-ble-plx` that this app needs.
- The iOS Simulator has no Bluetooth radio. UI works, BLE doesn't.

So the only options that actually run real Bluetooth on a phone are:

| Path | Cost | One-time setup | Reinstall? |
|---|---|---|---|
| **A. Free Apple ID + EAS + sideload via Xcode** | Free | ~30 min | every 7 days |
| **B. Free Apple ID + EAS + AltStore auto-refresh** | Free | ~45 min | auto-refreshes weekly while phone is on Wi-Fi with the AltServer |
| **C. $99 Apple Developer + EAS internal distribution** | $99/yr | ~30 min | every ~12 months |

Path A is the fastest first run. Path B is the best free long-term option.
Path C is what you'd actually want in production for a fleet of collectors.

---

## Path A — Free Apple ID, sideload via Xcode (do this tonight)

### What you need
- A Mac with **Xcode** installed (free from the Mac App Store, ~30 GB).
  - On your Mac: open the App Store → search "Xcode" → Install.
- A USB-C / Lightning cable to plug the iPhone into the Mac.
- An Apple ID. Any free Apple ID works — does **not** need a $99 developer
  membership.
- An [Expo](https://expo.dev/signup) account (free).
- About 30 minutes (most of which is the EAS cloud build running while you
  do something else).

### Step 1 — Get the code on your Mac

```bash
git clone https://github.com/ShootJackal/EGOWRIST-CamSync.git
cd EGOWRIST-CamSync
git checkout cursor/verify-gopro-command-center-8353  # until merged
npm run setup
```

### Step 2 — Build the unsigned IPA in EAS cloud

```bash
npm install -g eas-cli
eas login                         # paste your Expo account credentials
eas build:configure               # press Enter to accept defaults
npm run build:ios:dev             # runs in EAS cloud, ~10–15 min
```

When EAS asks about credentials:
- **Apple Account?** → answer **No**. We don't want EAS to talk to Apple at
  all on Path A.
- **Generate ad-hoc provisioning profile?** → also No.
- It will fall back to building an **unsigned** `.ipa`. That's exactly what
  we want — we'll let Xcode sign it locally with your free Apple ID in
  step 3.

When the build finishes, download the `.ipa` from the EAS build page (the URL
EAS prints when the build starts, e.g. `https://expo.dev/accounts/.../builds/<id>`).

> Alternative if Path A's "no credentials" flow fails for you: use Path B.
> The reason this works in Path A is that Xcode can re-sign any `.ipa` with
> a personal team locally, but EAS sometimes wants credentials anyway. If it
> does, just answer Yes to "log in with Apple ID" and use your **free** Apple
> ID — EAS will create a free 7-day provisioning profile and build a signed
> IPA you can install directly.

### Step 3 — Install onto the iPhone

1. Plug the iPhone into the Mac with a cable. Unlock the iPhone, tap **Trust**
   when the popup appears.
2. Open **Xcode** → menu **Window → Devices and Simulators**.
3. Select your iPhone in the left sidebar.
4. Drag the downloaded `.ipa` file onto the **Installed Apps** list.
5. Wait ~10 seconds. The app appears on the iPhone home screen.

### Step 4 — Trust the developer profile on the iPhone

First launch will show "Untrusted Developer" and refuse to open. Fix once:

1. iPhone **Settings → General → VPN & Device Management**.
2. Under **Developer App**, tap your Apple ID.
3. Tap **Trust "<your Apple ID>"** → **Trust**.
4. Now tap the EGO GoProSYNC icon on the home screen — it opens.

### Step 5 — Pair your three GoPros (one-time)

1. iOS prompts for Bluetooth — tap **Allow**.
2. **Settings tab → Connection Mode → Direct BLE**. Banner turns blue.
3. **Settings → Pair Cameras**.
4. For each GoPro:
   - On the camera: **Preferences → Connections → Connect Device → GoPro Quik App**.
   - In the app: tap **Assign** next to slot 1 → **Scan for GoPros** → tap the
     `GP24500001` (or similar) result.
   - Optionally rename the slot to "Left Wrist" / "Helmet" / etc.
5. Repeat for slots 2 and 3.

### Step 6 — Record

**Capture** tab → **Connect All** → wait for three green cards → **Start All**
(red dots on all three GoPros, live timer starts) → **Stop All** when done.

### Free-Apple-ID limitation

Apps signed with a free Apple ID stop launching after **7 days**. To keep
using the app:

- **Easy fix:** rerun `npm run build:ios:dev`, drag the new IPA onto the
  iPhone in Xcode. Takes 10 minutes.
- **Better fix:** use Path B (AltStore auto-refresh).
- **Best fix:** spend $99 on an Apple Developer membership and switch to
  Path C — installs last a year.

---

## Path B — AltStore auto-refresh (free, no 7-day reinstall manually)

[AltStore](https://altstore.io/) is an open-source sideloading tool that runs
a tiny "AltServer" on your Mac. While the iPhone is on the same Wi-Fi as the
Mac, the server silently re-signs and reinstalls your sideloaded apps every
~6 days, so they never expire from your perspective.

### What you need
- Everything from Path A.
- AltStore installed on the iPhone (free).
- AltServer running on your Mac (free).

### Step 1 — Build the IPA the same way as Path A

```bash
npm run build:ios:dev
```

Download the `.ipa` from the EAS build URL.

### Step 2 — Install AltStore on the iPhone

1. On your Mac, download AltServer from <https://altstore.io/>.
2. Drag AltServer.app to /Applications, open it.
3. AltServer lives in the menu bar. Click it → **Install AltStore → [your iPhone]**.
4. AltServer prompts for your Apple ID — use your free Apple ID.
5. AltStore appears on the iPhone home screen. Trust the developer profile
   the same way as Path A step 4.

### Step 3 — Sideload the EGO GoProSYNC IPA via AltStore

1. AirDrop the `.ipa` from your Mac to the iPhone.
2. iPhone shows "Open in AltStore" — tap it.
3. AltStore prompts for your Apple ID password again (one-time per session)
   to sign the app, then installs it.
4. Trust the developer profile the same way.

### Step 4 — Auto-refresh

While AltServer is running on the Mac and the iPhone is on the same Wi-Fi,
the apps refresh themselves every few days. Practically: keep AltServer
running on your studio Mac, your collectors' phones never need a manual
reinstall.

If a refresh ever fails (you were off Wi-Fi for too long), open AltStore on
the iPhone → **My Apps** → tap the EGO GoProSYNC tile → it re-signs in 30 s.

### Pair and record — same as Path A steps 5–6.

---

## Path C — $99/year Apple Developer Program (production)

If this is going into ongoing collector use, this is the right option.

```bash
npm install -g eas-cli
eas login
eas build:configure
npm run build:ios            # uses the "preview" EAS profile
```

When EAS asks:
- **Apple ID** → your developer-account email.
- **Apple Team** → pick your paid team.
- **Distribution certificate / provisioning profile** → let EAS create them.

The build produces a properly-signed `.ipa`. You then have two install paths:

- **TestFlight** (recommended for collector fleets):
  ```bash
  eas submit -p ios --latest
  ```
  This uploads to App Store Connect. Add testers' Apple IDs in the
  TestFlight tab; they install via the TestFlight app from the App Store.
  Builds are valid for ~90 days each, refreshed by uploading a new build.

- **Direct install** for ad-hoc devices: register up to 100 device UDIDs in
  Apple Developer, regenerate the EAS provisioning profile, and the install
  link from EAS works directly in Safari.

Pair and record — same as Path A steps 5–6.

---

## Iteration tip — `expo-dev-client` for fast UI changes

If you'll be editing the UI a lot, the `development` EAS profile builds an
**Expo Dev Client**. Once it's installed on the iPhone (one-time per device),
you can run the JS bundler on your Mac and the Dev Client will hot-reload
changes over Wi-Fi without ever rebuilding the native app.

```bash
npm run build:ios:dev          # one-time native build with Dev Client
# install on phone via Path A or B steps 3–4
npx expo start --dev-client    # on your Mac, every subsequent edit
```

When you make UI changes, save the file, the Dev Client picks them up in ~1 s.
Only when you change native code (like adding a new native module) do you
need to rebuild the IPA.

This does **not** unlock real BLE on the simulator; the BLE code only runs
on a real iPhone. But once the Dev Client is on your phone, every UI tweak
to the BLE flows is one-second-feedback instead of fifteen-minute-rebuild.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| EAS build fails: "Could not find an Apple Team" | Path A only. Re-run with `eas build --platform ios --profile development --non-interactive` after answering No to the Apple-account prompt; if that still fails, do Path C with your free Apple ID — EAS supports free 7-day provisioning. |
| Xcode "Failed to install" | Make sure the iPhone is unlocked, trusted, and that Xcode → Settings → Accounts has your Apple ID added. |
| "Untrusted Developer" still appears after trusting | The developer profile name is per-Apple-ID. If you've used multiple IDs, make sure you trusted the same one that signed this build. Re-check Settings → General → VPN & Device Management. |
| Direct BLE banner stays "not supported here" inside the installed app | The build was the wrong profile. Make sure you ran `npm run build:ios:dev` or `npm run build:ios`, not `npm run build:ios:sim`. The simulator profile doesn't include BLE. |
| Camera scan finds nothing | Camera not in pairing mode. On each GoPro: Preferences → Connections → Connect Device → GoPro Quik App. Then re-scan. |
| Pair succeeds but Connect fails | Camera went to sleep. Wake it (Mode button) or pair again. The app sends Keep Alive every 3 s while connected. |
