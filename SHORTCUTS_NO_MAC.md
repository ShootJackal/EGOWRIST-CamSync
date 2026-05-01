# SHORTCUTS_NO_MAC.md — Control 3 GoPros from your iPhone with $0 and no Mac

Free. No Apple Developer membership. No TestFlight. No Mac running anything.
The collector just taps a button on their iPhone home screen.

## How it's possible

Your three GoPros live on your home/studio Wi-Fi (Station mode), each with
its own IP. The iPhone is on the same Wi-Fi. Each GoPro exposes its HTTP
control API on port 8080 and accepts plain GET requests like
`http://<gopro-ip>:8080/gopro/camera/shutter/start`.

Safari can't call those URLs from a webpage because of browser security
(CORS + mixed content), but **iOS Shortcuts is not a webpage** — it's an
iOS system app, and its "Get Contents of URL" action has no CORS or
mixed-content restrictions. It just makes the HTTP request and returns.

So we build three Shortcuts: Connect All, Start All, Stop All. Pin them to
the home screen. Done.

## What you give up vs the full app

| Feature | Full native app | iOS Shortcuts |
|---|---|---|
| Start / stop all 3 cameras | ✓ | ✓ |
| Live battery / SD / status display | ✓ | ✗ — fire and forget |
| Cross-camera command spread metric | ✓ | ✗ — no measurement |
| Pre-flight readiness gate | ✓ | ✗ |
| Slot nicknames in UI | ✓ | (in the Shortcut name) |
| Session history log | ✓ | ✗ |

For ego-centric collection where you just need "start all" / "stop all" at
the right moments and you'll check footage post-session, Shortcuts cover
the critical path. Use the GoPro screens themselves to verify battery /
storage before you start.

---

## One-time prerequisites (~10 min)

1. Pair each GoPro to your home/studio Wi-Fi using the GoPro Quik mobile
   app. Steps are in `LAN_TONIGHT.md` step 1 — same procedure.
2. On a Mac on the same Wi-Fi, run the IP scanner (one-time):
   ```bash
   git clone https://github.com/ShootJackal/EGOWRIST-CamSync.git
   cd EGOWRIST-CamSync
   npm install
   npm run find-gopros
   ```
   You'll get the three IPs:
   ```
   • 192.168.1.42    HERO12 Black    C3441334512345
   • 192.168.1.51    HERO12 Black    C3441334567890
   • 192.168.1.63    HERO11 Black    C3331334111111
   ```
   No Mac? You can find the IPs in your Wi-Fi router's admin UI under
   "DHCP clients" — GoPros usually show as `GP24500001` or similar.

3. **In your router admin UI, set DHCP reservations** for each GoPro's MAC
   address so the IPs never change. Otherwise you'll have to edit the
   Shortcuts every time a GoPro gets a new IP. This is the single most
   important step for long-term reliability.

---

## Build the Start All Shortcut (~2 min)

On the iPhone:

1. Open the **Shortcuts** app (built in to iOS).
2. Tap **+** in the top right to make a new Shortcut.
3. Tap **Add Action** → search **"Get Contents of URL"** → tap it.
4. In the URL field, paste:
   ```
   http://192.168.1.42:8080/gopro/camera/shutter/start
   ```
   (use your actual GoPro 1 IP). Tap the **▾** to expand options:
   - **Method:** GET (default)
   - Leave everything else default.
5. Tap **Add Action** again → another **Get Contents of URL**, this time
   for GoPro 2:
   ```
   http://192.168.1.51:8080/gopro/camera/shutter/start
   ```
6. Add a third **Get Contents of URL** for GoPro 3.
7. Add **Show Notification** as the last action. Body: `All cameras
   recording`. Title: `GoPro` (optional).
8. Tap the Shortcut name at the top → rename to `Start All`. Pick an icon
   color and glyph (record dot is appropriate).
9. Tap **Done**.

### Pin Start All to the home screen

1. In the Shortcuts list, long-press your `Start All` Shortcut.
2. Tap **Share** → **Add to Home Screen**.
3. Tap **Add** in the top right.

You now have a `Start All` icon on the iPhone home screen. Tap it → all
three cameras start recording in ~150 ms (one HTTP GET each, sequential).

---

## Build the Stop All Shortcut (~1 min)

Same recipe, but:

- URLs end in `/gopro/camera/shutter/stop` instead of `start`.
- Notification text: `All cameras stopped`.
- Name: `Stop All`. Icon: square (stop) glyph in red.
- Add to home screen.

---

## Build the Connect All Shortcut (optional, ~1 min)

In **Direct BLE** mode the camera needs an explicit connect. Over Wi-Fi
(Station mode) it doesn't — if the camera is on the network, it's
reachable. So you don't strictly need a Connect step. But if you want a
sanity-check Shortcut that pings each camera before a take:

- Action 1–3: **Get Contents of URL** for each camera, URL ending in
  `/gopro/camera/info` (returns JSON with model name).
- Action 4: **Show Notification**: `All 3 cameras online`.
- If any camera is unreachable the Shortcut will throw an error popup
  with the failing IP, which is exactly what you want pre-session.

---

## Optional: parallel start instead of sequential

The default Shortcut runs actions one after another. With three cameras
that's typically <500 ms total spread, which is fine for ego data. If you
want truly parallel starts, replace the three "Get Contents of URL"
actions with this trick:

1. Add **Repeat with Each** → list = your 3 IPs as separate text items.
2. Inside the loop, **Get Contents of URL** with `http://[Repeat Item]:8080/gopro/camera/shutter/start`.

iOS still runs the loop sequentially, but the latency is dominated by Wi-Fi
RTT (~5–10 ms) rather than HTTP setup, so the cross-camera spread stays
under 100 ms in practice. Genuine parallel HTTP isn't possible from
Shortcuts on iOS today.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not communicate with the server" on tap | Camera asleep. Wake with the Mode button. Or the IP changed — check the router and update the Shortcut. |
| Notification fires but the GoPro didn't actually start | Camera was offline; HTTP GETs to a dead host time out silently in Shortcuts. Add an "If" action checking the response status. |
| One camera starts, others don't | One IP is wrong or that camera is asleep. Tap each Shortcut individually to find the bad one. |
| Wi-Fi "guest network" mode blocks cross-client traffic | Switch the iPhone and the GoPros to your main Wi-Fi (not the guest network). |
| iPhone goes onto cellular and Shortcut breaks | Pin to Wi-Fi for sessions, or use GoPro COHN (cloud control over cellular) which is its own setup. |

---

## What this can't do

- **Real-time battery / SD / recording state.** Shortcuts can fetch
  `/gopro/camera/state` and parse the JSON, but rendering it nicely
  on iPhone is awkward — the dashboard UI in the full app is built for
  exactly that.
- **Pre-flight blocker enforcement.** The full app stops you from hitting
  Start All if any camera is at <15% battery. Shortcuts won't.
- **Session history.** Shortcuts have no persistent log. The GoPros do
  log every clip on their SD cards, but cross-camera session correlation
  has to happen post-shoot in your editor.

If those matter for your collection workflow, fall back to one of the
fuller paths:

- LAN from Mac — same network architecture, full UI, $0, but the Mac has
  to be running. See `LAN_TONIGHT.md`.
- Free Apple ID + Xcode sideload of the native app — full UI with Direct
  BLE, $0 plus a 7-day refresh chore. See `IOS_INSTALL.md` Path A.
- Raspberry Pi running the bridge — full UI, no Mac, $35 one-time. See
  the note in `IOS_INSTALL.md`.
- TestFlight — full UI, no friction, $99/year. See `TESTFLIGHT.md`.
