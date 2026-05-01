import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';

import { CameraRegistry, CameraMode } from './services/cameraRegistry';
import { SessionService } from './services/sessionService';
import { LogService } from './services/logService';

// ── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.BRIDGE_PORT ?? '4000', 10);
const HOST = process.env.BRIDGE_HOST ?? '0.0.0.0';
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN ?? '';
const CAMERA_MODE = (process.env.CAMERA_MODE ?? 'mock') as CameraMode;
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const LOG_DIR = process.env.LOG_DIR ?? path.join(__dirname, '../../../../logs');
const ALLOWED_ORIGINS_RAW = process.env.ALLOWED_ORIGINS ?? 'http://localhost:8081,https://*.vercel.app';

const allowedOriginPatterns = ALLOWED_ORIGINS_RAW.split(',')
  .map((o) => o.trim())
  .map((o) => {
    const escaped = o.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return allowedOriginPatterns.some((p) => p.test(origin));
}

// ── Services ─────────────────────────────────────────────────────────────────

const registry = new CameraRegistry(CAMERA_MODE);
const sessions = new SessionService();
const logger = new LogService(LOG_DIR);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) cb(null, true);
      else cb(new Error(`Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Auth middleware ───────────────────────────────────────────────────────────

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) { next(); return; }
  const header = req.headers.authorization ?? '';
  if (header === `Bearer ${AUTH_TOKEN}`) { next(); return; }
  res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
}

app.use('/api', authMiddleware);

// ── Logging helper ────────────────────────────────────────────────────────────

function info(...args: unknown[]): void {
  if (LOG_LEVEL !== 'silent') console.log('[bridge]', ...args);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  if (AUTH_TOKEN) {
    const proto = req.headers['sec-websocket-protocol'] ?? '';
    const parts = proto.split(',').map((p) => p.trim());
    if (!parts.includes(AUTH_TOKEN) && !parts.includes(`Bearer ${AUTH_TOKEN}`)) {
      ws.close(1008, 'Unauthorized');
      return;
    }
  }
  wsClients.add(ws);
  info(`WebSocket client connected (total: ${wsClients.size})`);
  ws.on('close', () => {
    wsClients.delete(ws);
    info(`WebSocket client disconnected (total: ${wsClients.size})`);
  });
});

function broadcast(data: unknown): void {
  const msg = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

async function broadcastState(): Promise<void> {
  try {
    const cameras = await registry.getAllStatuses();
    broadcast({ type: 'cameras', cameras });
    const session = sessions.getActive();
    broadcast({ type: 'session', session });
  } catch { /* ignore */ }
}

// Broadcast state every 2 seconds to WebSocket clients
setInterval(broadcastState, 2000);

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  const cameras = await registry.getAllStatuses();
  const cameraMap: Record<string, string> = {};
  cameras.forEach((c) => { cameraMap[c.id] = c.connectionState; });
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    cameras: cameraMap,
    mode: CAMERA_MODE,
  });
});

// ── Cameras ───────────────────────────────────────────────────────────────────

app.get('/api/cameras', async (req, res) => {
  const cameras = await registry.getAllStatuses();
  res.json({ cameras });
});

app.get('/api/cameras/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ctrl = registry.get(id);
  if (!ctrl) { res.status(404).json({ error: `Camera ${id} not found`, code: 'NOT_FOUND' }); return; }
  const camera = await ctrl.getStatus();
  res.json({ camera });
});

app.post('/api/cameras/:id/connect', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ctrl = registry.get(id);
  if (!ctrl) { res.status(404).json({ error: `Camera ${id} not found`, code: 'NOT_FOUND' }); return; }
  const issuedAt = new Date();
  const result = await ctrl.connect();
  logger.log(id, 'connect', issuedAt, result.success, result.latencyMs, { errorCode: result.errorCode, errorMessage: result.errorMessage });
  info(`Camera ${id} connect: ${result.success ? 'ok' : result.errorMessage}`);
  broadcastState();
  res.json(result);
});

app.post('/api/cameras/:id/disconnect', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ctrl = registry.get(id);
  if (!ctrl) { res.status(404).json({ error: `Camera ${id} not found`, code: 'NOT_FOUND' }); return; }
  const issuedAt = new Date();
  const result = await ctrl.disconnect();
  logger.log(id, 'disconnect', issuedAt, result.success, result.latencyMs);
  broadcastState();
  res.json(result);
});

app.post('/api/cameras/:id/start', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ctrl = registry.get(id);
  if (!ctrl) { res.status(404).json({ error: `Camera ${id} not found`, code: 'NOT_FOUND' }); return; }
  const sessionId = (req.body?.sessionId as string | undefined) ?? sessions.getActive()?.id;
  const issuedAt = new Date();
  const result = await ctrl.startRecording(sessionId);
  logger.log(id, 'startRecording', issuedAt, result.success, result.latencyMs, { sessionId, errorCode: result.errorCode, errorMessage: result.errorMessage });
  info(`Camera ${id} startRecording: ${result.success ? 'ok' : result.errorMessage}`);
  broadcastState();
  res.json(result);
});

app.post('/api/cameras/:id/stop', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ctrl = registry.get(id);
  if (!ctrl) { res.status(404).json({ error: `Camera ${id} not found`, code: 'NOT_FOUND' }); return; }
  const sessionId = (req.body?.sessionId as string | undefined) ?? sessions.getActive()?.id;
  const issuedAt = new Date();
  const result = await ctrl.stopRecording(sessionId);
  logger.log(id, 'stopRecording', issuedAt, result.success, result.latencyMs, { sessionId, errorCode: result.errorCode, errorMessage: result.errorMessage });
  broadcastState();
  res.json(result);
});

app.post('/api/cameras/:id/status', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ctrl = registry.get(id);
  if (!ctrl) { res.status(404).json({ error: `Camera ${id} not found`, code: 'NOT_FOUND' }); return; }
  const issuedAt = new Date();
  const start = Date.now();
  const status = await ctrl.getStatus();
  const latencyMs = Date.now() - start;
  logger.log(id, 'refreshStatus', issuedAt, true, latencyMs);
  const result = { success: true, cameraId: id, command: 'refreshStatus', latencyMs, errorCode: null, errorMessage: null };
  res.json(result);
});

// ── Bulk camera operations ────────────────────────────────────────────────────

app.post('/api/cameras/connect-all', async (req, res) => {
  const issuedAt = new Date();
  const results = await registry.connectAll();
  results.forEach((r) => logger.log(r.cameraId, 'connect', issuedAt, r.success, r.latencyMs, { errorCode: r.errorCode, errorMessage: r.errorMessage }));
  broadcastState();
  res.json({ results });
});

app.post('/api/cameras/start-all', async (req, res) => {
  const issuedAt = new Date();
  const session = sessions.startSession(registry.ids());
  const { results, spreadMs } = await registry.startAll(session.id);
  sessions.setActiveCommandSpread(spreadMs);

  results.forEach((r) =>
    logger.log(r.cameraId, 'startRecording', issuedAt, r.success, r.latencyMs, {
      sessionId: session.id,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
    }),
  );
  info(`Session ${session.id} started, spread=${spreadMs}ms`);
  broadcastState();
  res.json({ results, session: sessions.getActive() ?? session });
});

app.post('/api/cameras/stop-all', async (req, res) => {
  const issuedAt = new Date();
  const activeSession = sessions.getActive();
  const results = await registry.stopAll(activeSession?.id);
  const ended = sessions.stopSession();
  results.forEach((r) =>
    logger.log(r.cameraId, 'stopRecording', issuedAt, r.success, r.latencyMs, {
      sessionId: ended?.id,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
    }),
  );
  if (ended) info(`Session ${ended.id} stopped, duration=${ended.durationMs}ms`);
  broadcastState();
  res.json({ results, session: ended });
});

app.post('/api/cameras/status-all', async (req, res) => {
  const cameras = await registry.statusAll();
  res.json({ cameras });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get('/api/sessions/active', (req, res) => {
  res.json({ session: sessions.getActive() });
});

app.get('/api/sessions', (req, res) => {
  res.json({ sessions: sessions.getHistory() });
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[bridge] Error:', err.message);
  res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  info(`Bridge server running at http://${HOST}:${PORT}`);
  info(`Camera mode: ${CAMERA_MODE}`);
  info(`Auth: ${AUTH_TOKEN ? 'enabled' : 'disabled'}`);
  info(`Allowed origins: ${ALLOWED_ORIGINS_RAW}`);
  info(`Log dir: ${LOG_DIR}`);
});
