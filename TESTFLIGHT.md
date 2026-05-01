# TESTFLIGHT.md — Get EGO GoProSYNC into TestFlight

End state: collectors install the app from the **TestFlight** app on the
iPhone with one tap, get notified of new builds automatically, and the app
is signed for ~90 days per build (no 7-day reinstall dance).

Total time: ~45 minutes if you already have the Apple Developer membership.
Add 24–48 hours if Apple needs to verify your enrollment.

---

## Step 0 — Required accounts (one-time, do these first)

1. **Apple Developer Program — $99/year.** Sign up at
   https://developer.apple.com/programs/. App Store Connect / TestFlight
   require this; there is no free workaround.
   - Approval is sometimes instant. Sometimes Apple holds it 24–48 hours
     for ID verification — they email you when it's done.
   - You can do steps 1, 2, and 3 below in parallel while waiting.
2. **Expo account.** https://expo.dev/signup — free.
3. A Mac with Node 20+ installed (`brew install node`).

---

## Step 1 — Reserve the bundle identifier in App Store Connect

1. Go to https://appstoreconnect.apple.com/ → **My Apps** → **+** → **New App**.
2. Fill in:
   - **Platform:** iOS
   - **Name:** `EGO GoProSYNC` (or whatever public name you want — this is
     what shows up in TestFlight)
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** click the dropdown → **Register a new bundle ID** in a
     new tab. In the developer portal:
     - **Description:** EGO GoProSYNC
     - **Bundle ID:** Explicit → `com.shootjackal.egogoprosync`
       *(this must match `app.json → expo.ios.bundleIdentifier`)*
     - **Capabilities:** none required for BLE-only operation
     - Continue → Register.
   - Back in App Store Connect, refresh the dropdown and pick that bundle ID.
   - **SKU:** anything unique, e.g. `ego-goprosync-001`
   - **User Access:** Full Access
3. **Create**.

You'll land on the new app's page in App Store Connect. **Note the App ID**
shown in the URL (it's a 10-digit number like `6745912345`). You'll need it
in step 4.

---

## Step 2 — Get the code on your Mac

```bash
git clone https://github.com/ShootJackal/EGOWRIST-CamSync.git
cd EGOWRIST-CamSync
git checkout cursor/verify-gopro-command-center-8353   # until merged
npm run setup
```

---

## Step 3 — Install and authenticate EAS

```bash
npm install -g eas-cli
eas login                    # paste your Expo account credentials
eas whoami                   # should print your Expo username
eas build:configure          # press Enter at every prompt
```

`eas build:configure` writes your Expo `projectId` into `app.json`. It does
not touch your Apple credentials.

---

## Step 4 — Wire the App Store Connect ID into eas.json

Open `eas.json`, find the two `ascAppId` fields, replace the placeholder
with the App ID from step 1:

```json
"submit": {
  "testflight": {
    "ios": {
      "ascAppId": "6745912345"
    }
  },
  ...
}
```

Save.

---

## Step 5 — Build and auto-submit to TestFlight

This is the only step that talks to Apple. Run:

```bash
npm run build:ios:testflight
```

EAS will prompt you, **once**, for everything it needs:

- **Apple ID** → your developer-account email.
  - If your Apple ID has 2FA (it should), it'll text you a code. Paste it.
- **Apple Team** → pick your paid Developer team.
- **Distribution certificate** → let EAS create one (recommended).
- **Provisioning profile** → let EAS create one.
- **Push notification key** → No (we don't use push).
- **App Store Connect API Key** for the auto-submit step → easiest is to
  let EAS create one, but you can also generate one yourself in App Store
  Connect → Users and Access → Integrations → Keys (role: App Manager).

EAS stores all of this in your Expo account, so you'll only do it once.

The build runs in EAS cloud — your Mac just kicks it off. Watch progress at
the URL EAS prints (e.g. `https://expo.dev/accounts/.../builds/<id>`).

When the build finishes (~10–20 min), EAS automatically submits the IPA to
App Store Connect. You'll see a success message with the App Store Connect
build URL.

---

## Step 6 — Wait for App Store Connect to process the build (~5–15 min)

Apple needs to process every uploaded build before TestFlight can serve it.
You'll get an email from Apple when it's done. In the meantime:

1. Open https://appstoreconnect.apple.com/ → your app → **TestFlight** tab.
2. The build appears as **Processing**. Refresh occasionally.
3. When status changes to **Ready to Submit** (internal) or **Missing
   Compliance** (just answer "No" to the encryption question), the build
   is installable.

The first build always asks two questions in App Store Connect:

- **Does your app use encryption?** → For BLE-only, the honest answer is
  **No** (BLE pairing uses Apple's framework, not custom crypto). This
  exempts you from the export compliance paperwork.
- **Test details for review** → only required for *external* testers.
  **Skip if you're only inviting your own collectors as internal testers.**

---

## Step 7 — Add testers

You have two flavours:

### Internal testers — instant, up to 100 people, no Apple review

Best for your own team / collectors.

1. App Store Connect → your app → **Users and Access** → invite each
   collector by their **Apple ID email**, give them the **App Manager** or
   **Developer** role. They accept the email invite.
2. Then in your app → **TestFlight** tab → **Internal Testing** → **+** →
   pick the group → add the people you just invited.

They'll get an email with a link to install **TestFlight** from the App
Store, then your app appears inside TestFlight with one tap to install.

### External testers — up to 10,000 people, requires Apple review (~1 day)

Best if you want to send a public invite link.

1. App Store Connect → your app → **TestFlight** → **External Testing** →
   **+** → create a group.
2. Add testers by email, or generate a **Public Link** to share.
3. Submit the build for **Beta App Review**. Fill in:
   - What to test
   - Demo account credentials (if needed — for this app, "no login required")
   - Contact info
4. Apple reviews in ~24h. Once approved, the public link works for anyone.

---

## Step 8 — Install on the iPhone

For each collector:

1. They install the **TestFlight** app from the App Store.
2. They tap the email invite link → opens TestFlight → tap **Install**.
3. The app appears on the home screen.

### First-launch flow on the iPhone

1. Open EGO GoProSYNC.
2. iOS prompts for **Bluetooth permission** → tap **Allow**.
3. **Settings** tab → **Connection Mode → Direct BLE**.
4. **Settings → Pair Cameras** → for each GoPro:
   - Camera: Preferences → Connections → Connect Device → GoPro Quik App
   - In the app: **Assign** next to slot 1 → **Scan** → tap the camera
     name in the results.
   - Optionally rename the slot ("Left Wrist", "Helmet", etc.)
   - Repeat for slots 2 and 3.
5. **Capture** tab → **Connect All** → **Start All**. Recording.

---

## Pushing updates

Every time you want to ship a new version:

```bash
npm run build:ios:testflight
```

That bumps the version, builds, and auto-submits. Existing TestFlight users
get a **"new build available"** notification automatically.

If you ever build without auto-submit (e.g. you want to inspect the IPA
first), submit manually with:

```bash
npm run submit:ios:testflight
```

That uploads the most recent build to App Store Connect.

---

## Common gotchas

| Symptom | Fix |
|---|---|
| `eas build` hangs at "Apple Account" | You're behind a corporate proxy/VPN. Disconnect it for the credentials step. |
| Build fails with "Bundle ID not found" | The bundle ID in App Store Connect doesn't match `app.json → expo.ios.bundleIdentifier` (`com.shootjackal.egogoprosync`). Fix one of them. |
| Build succeeds, submit fails with "ASC API key required" | Run `eas credentials -p ios`, pick "App Store Connect API Key", and let EAS generate one. Re-run `npm run submit:ios:testflight`. |
| App Store Connect shows the build as "Invalid Binary" | Open the email Apple sent — it lists the rejection reason. Most common: missing usage description for Bluetooth. Already handled in this repo's `app.json`, but if you've forked it, make sure `NSBluetoothAlwaysUsageDescription` is present. |
| "Missing Compliance" stays red | Click the build → answer the encryption question → "No, my app does not use encryption". Saves the export-compliance answer for all future builds. |
| TestFlight email never arrives | The tester's Apple ID has to match the email exactly. They also have to install the **TestFlight** app from the App Store first; otherwise the link does nothing. |

---

## Cost recap

- **Apple Developer Program:** $99/year (required).
- **Expo:** free for the build minutes you'll use here.
- **EAS Build:** the free tier gives you 30 minutes of iOS build time per
  month; one TestFlight build is ~15 minutes, so you get ~2 free builds/month.
  Beyond that it's $19/month for the Production plan with priority builds.
  Most projects fit comfortably in the free tier during early testing.
