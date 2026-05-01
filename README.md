# EGO GoProSYNC — TaskFlow Capture

A TaskFlow-styled GoPro command center for controlling 3 GoPro cameras.

**Frontend:** Expo + React Native Web, hosted on Vercel  
**Bridge:** Local Express server running on your Mac, controls GoPros over Wi-Fi

---

## Architecture

```
iPhone Safari
    ↓ HTTPS
Vercel frontend (taskflow-capture.vercel.app)
    ↓ HTTP/WebSocket (configurable URL)
Local Mac bridge (http://192.168.1.50:4000)
    ↓ Wi-Fi (Open GoPro HTTP API)
GoPro 1 / GoPro 2 / GoPro 3
```

The Vercel frontend **never** directly touches GoPro hardware.  
The local bridge handles all camera I/O and exposes a clean REST + WebSocket API.

---

## How This Works With Vercel

The frontend is a static Expo Web export. It runs entirely in the browser. It connects to your Mac bridge via a URL you enter in the Settings screen.

On Vercel, `EXPO_PUBLIC_DEFAULT_BRIDGE_URL` can be set as an environment variable for a default bridge URL, but this is optional — users can always change it in Settings.

```
Vercel build command: npm run vercel-build
Output directory:     dist
```

---

## Quick Start

### 1. Frontend (Vercel or local dev)

```bash
npm install
npm run web          # local dev server
npm run build:web    # build for Vercel
```

### 2. Bridge (Mac)

```bash
npm run bridge:install      # install bridge dependencies
cp server/bridge/.env.example server/bridge/.env
# Edit .env if needed (defaults work for mock mode)
npm run bridge              # starts bridge at http://localhost:4000
```

Then open the Vercel app (or `http://localhost:8081`), go to **Settings**, enter `http://localhost:4000` as the bridge URL, and set mode to **Local LAN**.

---

## Connection Options

### Option A — Same Mac (local dev)

Run both the Expo dev server and bridge on your Mac:

```bash
# Terminal 1
npm run web

# Terminal 2
npm run bridge
```

In Settings, enter: `http://localhost:4000`

### Option B — Phone on same Wi-Fi (LAN)

Run bridge on Mac. Phone opens the Vercel-hosted frontend.

```bash
# Find your Mac's LAN IP
ifconfig | grep "inet " | grep -v 127

# Start bridge (it listens on 0.0.0.0)
npm run bridge
```

In the Vercel app Settings, enter: `http://<MAC_LAN_IP>:4000`  
Set mode to **Local LAN**.

### Option C — Tunnel (HTTPS, works anywhere)

Use Cloudflare Tunnel to expose the bridge securely over HTTPS:

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Start tunnel (one-time URL, good for testing)
cloudflared tunnel --url http://localhost:4000
```

Copy the `https://....trycloudflare.com` URL and paste it in Settings.  
Set mode to **Tunnel**.

This is the recommended approach for avoiding mixed-content HTTPS issues when the Vercel frontend is served over HTTPS.

---

## Mock Mode

The frontend includes a full mock camera simulation. No bridge required.

- Open the app
- Go to Settings → Connection Mode → **Mock**
- All 3 cameras simulate connect/record/stop with realistic battery drain and storage fill

Mock mode works on Vercel with zero additional setup.

---

## Bridge API

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Bridge health and camera connection states |
| GET | `/api/cameras` | All camera statuses |
| GET | `/api/cameras/:id` | Single camera status |
| POST | `/api/cameras/:id/connect` | Connect a camera |
| POST | `/api/cameras/:id/disconnect` | Disconnect a camera |
| POST | `/api/cameras/:id/start` | Start recording |
| POST | `/api/cameras/:id/stop` | Stop recording |
| POST | `/api/cameras/:id/status` | Refresh camera status |
| POST | `/api/cameras/connect-all` | Connect all cameras |
| POST | `/api/cameras/start-all` | Start all cameras (creates session) |
| POST | `/api/cameras/stop-all` | Stop all cameras (closes session) |
| POST | `/api/cameras/status-all` | Refresh all camera statuses |
| GET | `/api/sessions/active` | Active recording session |
| GET | `/api/sessions` | Session history |

### WebSocket

Connect to `ws://<bridge-host>:<port>/ws`

The bridge broadcasts every 2 seconds:
```json
{ "type": "cameras", "cameras": [...] }
{ "type": "session", "session": { ... } | null }
```

The frontend falls back to polling every 2 seconds if WebSocket is unavailable.

### Authentication

Set `BRIDGE_AUTH_TOKEN` in the bridge `.env` to require a Bearer token.  
Enter the same token in the frontend Settings screen.

---

## Bridge Environment Variables

```env
BRIDGE_PORT=4000
BRIDGE_HOST=0.0.0.0
BRIDGE_AUTH_TOKEN=           # Leave blank to disable auth
ALLOWED_ORIGINS=http://localhost:8081,https://*.vercel.app
CAMERA_MODE=mock             # mock | real
GOPRO_COMMAND_TIMEOUT_MS=5000
LOG_LEVEL=info               # info | silent
LOG_DIR=../../logs
```

---

## Real GoPro Setup

Set `CAMERA_MODE=real` in the bridge `.env`.

Edit `server/bridge/config/cameras.json`:
```json
[
  { "id": 1, "name": "GoPro 1", "ip": "10.5.5.9", "port": 8080 }
]
```

Each camera must be running in AP mode (the Mac joins the camera's Wi-Fi).  
The bridge talks to GoPros via the [Open GoPro HTTP API](https://gopro.github.io/OpenGoPro/).

**Limitation:** With multiple GoPros, each needs its own network interface or the Mac must switch Wi-Fi networks between cameras. For simultaneous multi-camera control, USB or a dedicated Wi-Fi bridge per camera is recommended.

---

## Session Logs

The bridge writes JSONL logs to `./logs/session-YYYY-MM-DD.jsonl`:

```json
{
  "timestamp": "2026-05-01T12:00:00.000Z",
  "sessionId": "abc-123",
  "cameraId": 1,
  "command": "startRecording",
  "commandIssuedAt": "...",
  "responseReceivedAt": "...",
  "latencyMs": 312,
  "success": true,
  "errorCode": null,
  "errorMessage": null
}
```

---

## Commands Reference

```bash
# Frontend
npm install          # install frontend deps
npm run web          # start Expo web dev server
npm run build:web    # build for Vercel (outputs to dist/)
npm run vercel-build # same as build:web (used by Vercel)
npm run typecheck    # TypeScript check

# Bridge
npm run bridge:install   # install bridge deps
npm run bridge           # run bridge in dev mode (hot reload)
npm run bridge:start     # run bridge in production mode

# Both
npm run bridge:install && npm run bridge
```

---

## Vercel Deployment

1. Push to GitHub
2. Connect the repo to Vercel
3. Build command: `npm run vercel-build`
4. Output directory: `dist`
5. (Optional) Add environment variable: `EXPO_PUBLIC_DEFAULT_BRIDGE_URL=`

The frontend will show in **Mock mode** by default until a user configures a bridge URL in Settings.
