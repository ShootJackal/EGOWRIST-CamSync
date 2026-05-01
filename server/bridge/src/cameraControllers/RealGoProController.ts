/**
 * RealGoProController — Open GoPro HTTP API scaffold
 *
 * Architecture:
 *   The Mac bridge connects to a GoPro camera over Wi-Fi (the camera acts as AP,
 *   the Mac joins the camera's Wi-Fi network, or the camera joins the Mac's hotspot).
 *   Commands are sent via HTTP to the camera's built-in web server at:
 *     http://10.5.5.9:8080  (GoPro AP mode — Mac joins GoPro)
 *   or via USB-ethernet adapter at a similar local IP.
 *
 * Open GoPro Spec: https://gopro.github.io/OpenGoPro/
 *
 * Limitation notices are honest — no fake successes.
 */

import { CameraController, CameraCommandResult, CameraStatus, MediaItem } from './CameraController';
import * as http from 'http';

interface GoProConfig {
  id: number;
  name: string;
  ip?: string;
  port?: number;
  timeoutMs?: number;
}

function notImplemented(cameraId: number, command: string, reason: string): CameraCommandResult {
  return {
    success: false,
    cameraId,
    command,
    latencyMs: 0,
    errorCode: 'NOT_IMPLEMENTED',
    errorMessage: `${command} not yet implemented: ${reason}`,
  };
}

async function goProGet(ip: string, port: number, path: string, timeoutMs: number): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${ip}:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

export class RealGoProController implements CameraController {
  private id: number;
  private name: string;
  private ip: string;
  private port: number;
  private timeoutMs: number;
  private lastStatus: CameraStatus;

  constructor(config: GoProConfig) {
    this.id = config.id;
    this.name = config.name;
    this.ip = config.ip ?? '10.5.5.9';
    this.port = config.port ?? 8080;
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.lastStatus = {
      id: this.id,
      name: this.name,
      connectionState: 'disconnected',
      recordingState: 'idle',
      batteryPercent: null,
      storageUsedMB: null,
      storageTotalMB: null,
      model: null,
      connectionType: 'wifi',
      lastCommand: null,
      lastCommandAt: null,
      errorMessage: null,
      firmwareVersion: null,
      isOnline: false,
    };
  }

  private markCommand(command: string, success: boolean, errorMessage: string | null = null): void {
    this.lastStatus.lastCommand = command;
    this.lastStatus.lastCommandAt = new Date().toISOString();
    if (!success) this.lastStatus.errorMessage = errorMessage;
    else this.lastStatus.errorMessage = null;
  }

  async connect(): Promise<CameraCommandResult> {
    const start = Date.now();
    this.lastStatus.connectionState = 'connecting';
    try {
      // Open GoPro: GET /gopro/camera/info
      const { statusCode, body } = await goProGet(this.ip, this.port, '/gopro/camera/info', this.timeoutMs);
      const latencyMs = Date.now() - start;
      if (statusCode !== 200) {
        this.lastStatus.connectionState = 'error';
        const msg = `Camera returned HTTP ${statusCode}`;
        this.markCommand('connect', false, msg);
        return { success: false, cameraId: this.id, command: 'connect', latencyMs, errorCode: 'HTTP_ERROR', errorMessage: msg };
      }
      const info = JSON.parse(body) as Record<string, unknown>;
      this.lastStatus.model = (info['model_name'] as string) ?? null;
      this.lastStatus.firmwareVersion = (info['firmware_version'] as string) ?? null;
      this.lastStatus.connectionState = 'connected';
      this.lastStatus.isOnline = true;
      this.markCommand('connect', true);
      return { success: true, cameraId: this.id, command: 'connect', latencyMs, errorCode: null, errorMessage: null, rawResponse: info };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      this.lastStatus.connectionState = 'error';
      this.markCommand('connect', false, msg);
      return { success: false, cameraId: this.id, command: 'connect', latencyMs, errorCode: 'NETWORK_ERROR', errorMessage: msg };
    }
  }

  async disconnect(): Promise<CameraCommandResult> {
    const start = Date.now();
    this.lastStatus.connectionState = 'disconnected';
    this.lastStatus.isOnline = false;
    this.markCommand('disconnect', true);
    return { success: true, cameraId: this.id, command: 'disconnect', latencyMs: Date.now() - start, errorCode: null, errorMessage: null };
  }

  async getStatus(): Promise<CameraStatus> {
    try {
      const start = Date.now();
      // Open GoPro: GET /gopro/camera/state
      const { statusCode, body } = await goProGet(this.ip, this.port, '/gopro/camera/state', this.timeoutMs);
      if (statusCode === 200) {
        const state = JSON.parse(body) as { status?: Record<string, unknown>; settings?: Record<string, unknown> };
        // Status ID 8 = battery, ID 70 = recording, ID 54 = storage remaining (kB)
        const status = state.status ?? {};
        const batteryRaw = status['8'];
        const recordingRaw = status['70'];
        const storageFreeKB = status['54'];
        const storageTotalKB = status['104'];

        if (typeof batteryRaw === 'number') {
          this.lastStatus.batteryPercent = batteryRaw;
        }
        if (recordingRaw === 1) {
          this.lastStatus.recordingState = 'recording';
        } else if (recordingRaw === 0) {
          this.lastStatus.recordingState = 'idle';
        }
        if (typeof storageFreeKB === 'number' && typeof storageTotalKB === 'number') {
          const totalMB = Math.round(storageTotalKB / 1024);
          const usedMB = totalMB - Math.round(storageFreeKB / 1024);
          this.lastStatus.storageTotalMB = totalMB;
          this.lastStatus.storageUsedMB = Math.max(0, usedMB);
        }
      }
    } catch {
      this.lastStatus.connectionState = 'error';
      this.lastStatus.isOnline = false;
    }
    return { ...this.lastStatus };
  }

  async startRecording(sessionId?: string): Promise<CameraCommandResult> {
    const start = Date.now();
    try {
      // Open GoPro: GET /gopro/camera/shutter/start
      const { statusCode } = await goProGet(this.ip, this.port, '/gopro/camera/shutter/start', this.timeoutMs);
      const latencyMs = Date.now() - start;
      if (statusCode === 200) {
        this.lastStatus.recordingState = 'recording';
        this.markCommand('startRecording', true);
        return { success: true, cameraId: this.id, command: 'startRecording', latencyMs, errorCode: null, errorMessage: null };
      }
      const msg = `Camera returned HTTP ${statusCode}`;
      this.markCommand('startRecording', false, msg);
      return { success: false, cameraId: this.id, command: 'startRecording', latencyMs, errorCode: 'HTTP_ERROR', errorMessage: msg };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      this.markCommand('startRecording', false, msg);
      return { success: false, cameraId: this.id, command: 'startRecording', latencyMs, errorCode: 'NETWORK_ERROR', errorMessage: msg };
    }
  }

  async stopRecording(sessionId?: string): Promise<CameraCommandResult> {
    const start = Date.now();
    try {
      // Open GoPro: GET /gopro/camera/shutter/stop
      const { statusCode } = await goProGet(this.ip, this.port, '/gopro/camera/shutter/stop', this.timeoutMs);
      const latencyMs = Date.now() - start;
      if (statusCode === 200) {
        this.lastStatus.recordingState = 'idle';
        this.markCommand('stopRecording', true);
        return { success: true, cameraId: this.id, command: 'stopRecording', latencyMs, errorCode: null, errorMessage: null };
      }
      const msg = `Camera returned HTTP ${statusCode}`;
      this.markCommand('stopRecording', false, msg);
      return { success: false, cameraId: this.id, command: 'stopRecording', latencyMs, errorCode: 'HTTP_ERROR', errorMessage: msg };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      this.markCommand('stopRecording', false, msg);
      return { success: false, cameraId: this.id, command: 'stopRecording', latencyMs, errorCode: 'NETWORK_ERROR', errorMessage: msg };
    }
  }

  async getPreviewStreamUrl(): Promise<string | null> {
    // Open GoPro preview stream requires specific negotiation and is model-dependent.
    // URL pattern: udp://0.0.0.0:8554 after enabling preview with:
    //   GET /gopro/camera/stream/start
    return null;
  }

  async listMedia(): Promise<MediaItem[]> {
    const start = Date.now();
    try {
      const { statusCode, body } = await goProGet(this.ip, this.port, '/gopro/media/list', this.timeoutMs);
      if (statusCode !== 200) return [];
      const data = JSON.parse(body) as { media?: Array<{ d: string; fs: Array<{ n: string; s: string; cre: string }> }> };
      const items: MediaItem[] = [];
      for (const dir of data.media ?? []) {
        for (const file of dir.fs ?? []) {
          items.push({
            filename: `${dir.d}/${file.n}`,
            sizeMB: parseInt(file.s, 10) / 1024 / 1024,
            createdAt: new Date(parseInt(file.cre, 10) * 1000).toISOString(),
          });
        }
      }
      return items;
    } catch {
      return [];
    }
  }
}
