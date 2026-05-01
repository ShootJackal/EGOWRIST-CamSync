# TESTING — Getting EGO GoProSYNC Ready for Field Use

This walks you through validating the system in three stages, from "no cameras
needed" to "three real GoPros mounted to a collector". Do them in order.

> **Goal:** A collector wears the iPhone in their pocket, opens the Vercel URL
> in Safari, and can connect/start/stop all three body-worn GoPros from one
> screen. The Mac bridge runs nearby (in a backpack, on a desk in the room,
> etc.) and is what actually talks to the cameras over Wi-Fi.

---

## Architecture (mental model)

```
[ iPhone Safari ] ─ HTTPS ─▶ [ Vercel frontend ]
                                    │
                                    │  HTTP(S) + WebSocket
                                    ▼
                           [ Mac bridge :4000 ]   ◀── you start this
                                    │
                                    │  Open GoPro HTTP API over Wi-Fi
                                    ▼
                       GoPro 1   GoPro 2   GoPro 3
```

**Key point:** the iPhone never talks to the GoPros. It only talks to the Mac
bridge. The Mac bridge is the one on the GoPros' Wi-Fi network(s).

---

## Stage 1 — Mock mode (no cameras, no bridge, no Mac)

Just the Vercel app. Use this to confirm the UI flows work and your collectors
know how to use it.

1. Push this branch to GitHub and let Vercel auto-deploy, **or** test locally:
   ```bash
   npm install
   npm run web        # opens http://localhost:8081
   ```
2. Open the app on your phone in Safari (or `localhost:8081` in a desktop browser).
3. Tap **Settings** → **Connection Mode** → **Mock**. Save.
4. Go to **Capture**. You should see:
   - Banner: *"Mock mode — No bridge required"*
   - Three camera cards labelled **GoPro 1 / 2 / 3**.
5. Tap **Connect All** → all three cards turn green ("Online").
6. Tap **Start All** → red recording banner appears with a live timer; cards say `● REC`.
7. Tap a card → opens the camera detail screen with status, storage bar, and per-camera controls.
8. Tap **Stop All** → session ends, duration shown. Switch to the **Logs** tab —
   the session is recorded under "Sessions".

✅ If all of the above works, the app and UX are good.

---

## Stage 2 — Local bridge in mock mode (Mac ↔ phone, no cameras yet)

This proves the network path between iPhone Safari → Vercel → bridge works **before** you involve cameras.

### Mac side

```bash
cd server/bridge
cp .env.example .env       # CAMERA_MODE defaults to "mock"
npm install
npm run dev                # bridge listens on http://0.0.0.0:4000
```

You should see:

```
[bridge] Bridge server running at http://0.0.0.0:4000
[bridge] Camera mode: mock
[bridge] Auth: disabled
```

Verify locally on the Mac:

```bash
curl http://localhost:4000/api/health
# {"status":"ok",...,"mode":"mock"}
```

Find your Mac's LAN IP:

```bash
ipconfig getifaddr en0          # most Macs
# or
ifconfig | grep "inet " | grep -v 127
```

Open `http://<MAC_IP>:4000/api/health` in your phone's browser. If you get the
JSON back, the phone can reach the bridge. If it can't, your Wi-Fi router is
isolating clients (common on guest networks) — switch networks or use Stage 2b.

### Phone side

1. Open the Vercel URL in Safari.
2. **Settings** → **Local LAN** → **Bridge URL** = `http://<MAC_IP>:4000` → **Test Connection**.
   - You should see "Connected!" in green.
3. Save settings. Go back to **Capture** — the banner now says **Bridge connected**.
4. Repeat the Connect All / Start All / Stop All flow. The bridge terminal prints lines like:

   ```
   [bridge] Camera 1 connect: ok
   [bridge] Session <uuid> started, spread=12ms
   [bridge] Session <uuid> stopped, duration=4218ms
   ```
5. The bridge writes a JSONL log to `logs/session-YYYY-MM-DD.jsonl`. Tail it:

   ```bash
   tail -f logs/session-$(date -u +%F).jsonl
   ```

### Stage 2b — Cloudflare Tunnel (only if you need HTTPS / are on a hostile network)

Vercel serves over HTTPS. Some browsers refuse HTTP-to-the-bridge calls
("mixed content"). If Stage 2 fails with a fetch error in Safari, expose the
bridge via Cloudflare:

```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:4000
# → https://random-words.trycloudflare.com
```

Phone → **Settings** → mode **Tunnel** → paste the `https://…trycloudflare.com`
URL → Test Connection → Save.

---

## Stage 3 — Real GoPros

Set this up **with one camera first**, then add the others.

### 3.0 Hardware/OS prep

- Mac on macOS 12+ with Wi-Fi.
- GoPro HERO11/12/13 (Open GoPro–compatible) on latest firmware.
- For each GoPro, enable Wi-Fi: long-press `MODE`, select Connections → Wi-Fi.

### 3.1 Connect the Mac to the GoPro

The Open GoPro HTTP API expects the Mac to be on the camera's Wi-Fi (the
camera is the access point at `10.5.5.9:8080`):

1. On the GoPro: **Connect Device → GoPro App**. Note the SSID (e.g. `GP24500001`) and password.
2. On the Mac, join that SSID from the Wi-Fi menu.
3. Verify:

   ```bash
   curl http://10.5.5.9:8080/gopro/camera/info
   # → JSON with model_name, firmware_version, etc.
   ```

   If that works, the bridge will work too.

### 3.2 Configure the bridge for one real camera

Edit `server/bridge/.env`:

```env
CAMERA_MODE=real
GOPRO_COMMAND_TIMEOUT_MS=5000
```

Edit `server/bridge/config/cameras.json` — for the single-camera test, leave only
GoPro 1 with the right IP:

```json
[
  { "id": 1, "name": "GoPro 1", "ip": "10.5.5.9", "port": 8080 }
]
```

Restart the bridge: `npm run dev`. From the phone, in **Capture** tab:

1. Tap **Connect** on GoPro 1 → card turns green and shows the model + firmware.
2. Tap **Start** → camera starts recording, red dot appears.
3. Tap **Stop** → camera stops.
4. Confirm by opening the GoPro physically — it actually started/stopped
   recording in sync with what the app says.

### 3.3 Multi-camera reality check (READ THIS)

> **Single-Mac limitation:** the Mac can only join **one** GoPro Wi-Fi network at a
> time. To control three GoPros simultaneously over Wi-Fi from the same Mac
> you need ONE of these:
>
> 1. **Three USB-Ethernet/USB-C cables** to the cameras (every modern GoPro
>    exposes the same HTTP API over USB at a per-cable IP). This is the most
>    reliable for ego-centric capture and lets the Mac control all three
>    instantly. **Recommended.**
>
> 2. **Three USB Wi-Fi adapters** on the Mac, each joined to one GoPro AP. Works
>    but flakier; cameras must each be on a unique IP and you’ll need static
>    routes.
>
> 3. **All three GoPros joined to your local Wi-Fi network** (camera in
>    "Station" mode, joining your router) and the Mac on the same Wi-Fi. Then
>    each camera gets a DHCP IP from your router on `:8080`. This works with
>    just the Mac's built-in Wi-Fi, but: range is whatever your router has,
>    and bouncing between cameras is throttled by the router.
>
> Pick option **3** for an in-room test, option **1** for actual collection.

For each camera you connect, find its IP (router DHCP table or `ip neighbor`
on Linux / `arp -a` on macOS). Then in `server/bridge/config/cameras.json`:

```json
[
  { "id": 1, "name": "GoPro 1", "ip": "192.168.50.11", "port": 8080 },
  { "id": 2, "name": "GoPro 2", "ip": "192.168.50.12", "port": 8080 },
  { "id": 3, "name": "GoPro 3", "ip": "192.168.50.13", "port": 8080 }
]
```

Restart the bridge. Repeat the start-all / stop-all flow from the phone. Watch
the bridge log — every command issued, latency, success/failure.

### 3.4 Sync quality

The Capture banner shows **"X ms command spread across cameras"** after Start All.
This is the wall-clock spread between the first and last camera responding.

For ego-centric capture, you typically want < 200 ms. If you’re seeing
multi-second spreads it almost always means:

- Cameras are on different Wi-Fi networks (Mac is roaming) — switch to
  USB or single shared network.
- Bridge is running on a remote machine with high RTT to the GoPros — run
  it on the same Mac that holds the GoPro Wi-Fi.

---

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| Phone shows **"Bridge unreachable"** | Phone is not on same Wi-Fi as Mac, or router has client isolation | Same Wi-Fi; or use Cloudflare Tunnel (Stage 2b) |
| Safari console: "Mixed content blocked" | Vercel page is HTTPS, bridge URL is HTTP | Use Cloudflare Tunnel and set Connection Mode → Tunnel |
| Connect succeeds but Start says "Camera not connected" | Camera Wi-Fi dropped between calls (GoPro AP power-saves) | Reconnect; or set GoPro to never sleep in camera settings |
| `curl 10.5.5.9:8080/...` works but bridge gets timeouts | Mac roamed to a different SSID | Re-pin Mac to the GoPro Wi-Fi; consider USB |
| WebSocket never connects, only polling | Tunnel/proxy strips upgrade | Most tunnels (Cloudflare, ngrok) support WS; check tunnel logs. App still works via polling, just 2 s slower. |
| Bridge shows `Origin … not allowed` | Vercel domain not in `ALLOWED_ORIGINS` | Add it to `server/bridge/.env`, restart bridge |

---

## Pre-flight checklist (collection day)

- [ ] Mac is on the same network/USB-bus as all three GoPros.
- [ ] All three GoPros show **Online + green dot** on the iPhone Capture screen.
- [ ] Tap **Start All** on a stopwatch — confirm all three cameras' red lights
      come on within ~1 second of each other (visually).
- [ ] Battery > 70% on all three; storage < 80% full.
- [ ] Bridge is writing to `logs/session-YYYY-MM-DD.jsonl` (tail it).
- [ ] iPhone Safari has the Vercel page open with the bridge URL saved (it
      persists in localStorage between launches — don't clear site data).

If all five boxes are checked, you're good to collect.
