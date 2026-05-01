# LAN_TONIGHT.md — Get the LAN setup live, real cameras, in ~25 minutes

You'll be able to: open Safari on your iPhone, hit one URL, and start/stop
all three GoPros from the dashboard. Your Mac runs the server that talks to
the cameras.

## Prereqs

- macOS 12+ Mac with Wi-Fi.
- Node 20+ (`brew install node` if missing; verify `node --version`).
- Three GoPros, charged (Hero 9 / 10 / 11 / 11 Mini / 12 / 13 / Max / Max 2).
- Your home or studio Wi-Fi network in range. **All three GoPros and the Mac
  will join this same network.**
- The GoPro Quik mobile app installed on a phone, **just for one-time
  per-camera Wi-Fi join** (you only need this once, not for collection).

> Why Quik for one-time setup? GoPros default to AP mode (each broadcasting
> its own Wi-Fi). The Mac can only join one Wi-Fi at a time, which is your
> exact problem. The fix is to put each GoPro into **Station mode** — joining
> your existing Wi-Fi router as a normal client. Quik is the official way to
> hand the GoPro your Wi-Fi credentials. After this is done once per camera,
> you never need Quik again.

---

## Step 1 — Pair each GoPro to your Wi-Fi (one-time, ~3 min per camera)

For each of your three cameras:

1. Power on the GoPro, swipe down → **Preferences → Connections → Connect Device → GoPro Quik App**.
2. Open Quik on your phone → **Camera** tab → **Add Camera** → pick the GoPro.
3. When Quik finishes pairing, it asks if you want to enable
   "Wireless Connections" / "COHN" / "Connect to Wi-Fi". **Yes.**
4. Pick your home/studio Wi-Fi SSID and enter the password. The camera now
   joins your Wi-Fi instead of broadcasting its own.
5. The camera now has a DHCP IP on your network. You can close Quik.

(You're done with Quik forever after this.)

---

## Step 2 — Get the code on your Mac (~2 min)

```bash
git clone https://github.com/ShootJackal/EGOWRIST-CamSync.git
cd EGOWRIST-CamSync
git checkout cursor/verify-gopro-command-center-8353
npm run setup
```

---

## Step 3 — Find each GoPro's IP automatically (~30 seconds)

Make sure your Mac is on the same Wi-Fi as the cameras, then:

```bash
npm run find-gopros
```

Output looks like:

```
Found 3 GoPros:
  • 192.168.1.42    HERO12 Black    C3441334512345
  • 192.168.1.51    HERO12 Black    C3441334567890
  • 192.168.1.63    HERO11 Black    C3331334111111

Suggested server/bridge/config/cameras.json:

[
  { "id": 1, "name": "GoPro 1 (2345)", "ip": "192.168.1.42", "port": 8080 },
  { "id": 2, "name": "GoPro 2 (7890)", "ip": "192.168.1.51", "port": 8080 },
  { "id": 3, "name": "GoPro 3 (1111)", "ip": "192.168.1.63", "port": 8080 }
]
```

If the scan finds zero, the most common cause is that the camera went to
sleep — wake each with the Mode button and re-run.

---

## Step 4 — Tell the bridge which IPs to use (~1 min)

Copy the JSON block from the scanner into `server/bridge/config/cameras.json`:

```bash
cp server/bridge/.env.example server/bridge/.env
echo 'CAMERA_MODE=real' >> server/bridge/.env
# now paste the scanner's JSON output into:
#   server/bridge/config/cameras.json
```

(or open both files in your editor and copy/paste — whichever you prefer.)

Make sure `server/bridge/.env` has `CAMERA_MODE=real` (the default is `mock`
which simulates fake cameras).

---

## Step 5 — Start everything in one shot (~5 sec)

```bash
npm run lan
```

You'll see a banner like:

```
─────────────────────────────────────────────────────────────
  EGO GoProSYNC — LAN dev launcher
─────────────────────────────────────────────────────────────

  Mac LAN IP(s):
    • 192.168.1.42    (en0)

  On your phone (same Wi-Fi as this Mac):
    1. Open Safari → http://192.168.1.42:8081
    2. Settings → Connection Mode → Local LAN
    3. Bridge URL → http://192.168.1.42:4000
    4. Tap "Test Connection" → "Connected!"
    5. Tap Save → go to Capture → Connect All → Start All
```

**Note the IP address on the first line of the banner — that's the only thing
you'll type into the iPhone.**

> Leave this terminal running — it's serving both the dashboard (port 8081)
> and the bridge (port 4000). Ctrl-C kills both.

---

## Step 6 — Connect from the iPhone (~1 min)

The iPhone has to be on the **same Wi-Fi network** as the Mac.

1. Open Safari on the iPhone.
2. Go to `http://<MAC_IP>:8081` (the address from the banner).
3. Tap the **Settings** tab in the bottom bar.
4. **Connection Mode** → tap **Local LAN**.
5. **Bridge URL** → enter `http://<MAC_IP>:4000`. (Same IP, port 4000.)
6. Tap **Test Connection** → wait ~1 s → button turns green and says
   "Connected!".
7. Tap **Save Settings** at the bottom.
8. Tap **Capture** in the bottom bar.

You should see three camera cards labelled with whatever names you put in
`cameras.json`.

---

## Step 7 — Record (~10 sec)

1. Tap **Connect All**. All three cards turn green within ~5 seconds.
2. Tap **Start All**. Red dots come on **on all three actual GoPros**, the
   banner shows the live timer, and you'll see the cross-camera *command
   spread* in milliseconds (typically <500 ms over Wi-Fi).
3. Tap **Stop All**. The session moves to the **Logs** tab.
4. Pop the SD card on any GoPro and confirm the new clip exists.

You're collecting.

---

## Add the iPhone to the home screen (optional, ~10 sec)

Makes the dashboard launch like an app icon:

1. In Safari on the iPhone, with the dashboard open, tap the **Share** button
   (square with up-arrow at the bottom).
2. **Add to Home Screen** → name it "GoPro" → **Add**.
3. From now on, tap the GoPro icon on the iPhone home screen — opens
   directly in fullscreen, no Safari chrome.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run find-gopros` finds nothing | Wake every camera (Mode button) and rerun. Confirm each camera was paired to your router via Quik in step 1. |
| Scan finds the cameras, but bridge logs `ECONNREFUSED` | Camera went to sleep again. Hit the Mode button. The bridge sends Keep Alive over BLE (Direct mode), but in LAN mode the GoPros sleep on their own schedule — disable auto-sleep in each camera's Preferences for collection-grade reliability. |
| Phone shows "Bridge unreachable" | Phone and Mac are not on the same Wi-Fi, **or** your router has client isolation enabled (common on some guest Wi-Fis). Switch to a non-guest network, or use Cloudflare Tunnel (see below). |
| Phone connects, but Start All only succeeds for some cameras | One camera is on a different IP after a reboot. Re-run `npm run find-gopros` and update `cameras.json`. Better: in your router admin UI, assign DHCP reservations so each GoPro always gets the same IP. |
| Mixed-content warning in Safari | Happens if you serve the dashboard from `https://` somewhere and the bridge URL is `http://`. Use a Cloudflare Tunnel: `brew install cloudflare/cloudflare/cloudflared && cloudflared tunnel --url http://localhost:4000`. Paste the `https://...trycloudflare.com` URL into Settings → mode **Tunnel**. |
| Camera battery is dying mid-session | LAN/Wi-Fi mode draws much more power than BLE. Plug each GoPro into USB power if possible, or reserve LAN mode for short tests and switch to the native iOS app (Direct BLE) for long collection. |

---

## What "tonight" looks like end-to-end

- 3 min  per camera × 3 cameras  = 9 min  Quik pairing (one-time forever)
- 2 min  clone + setup
- 30 sec scan
- 1 min  paste config
- 5 sec  `npm run lan`
- 1 min  iPhone Safari config
- 10 sec record test

**~14 min after Quik pairing** to first recording. The Quik step never has to
be repeated — next collection day, it's `npm run find-gopros && npm run lan`
and you're back online in 30 seconds.
