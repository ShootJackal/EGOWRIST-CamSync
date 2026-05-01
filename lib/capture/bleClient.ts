/**
 * Direct BLE GoPro client.
 *
 * Speaks the Open GoPro BLE protocol from the phone to each camera, with no
 * Mac, no bridge, and nothing physically attached to the GoPros. This is the
 * Camera-Tools-style workflow.
 *
 * Open GoPro BLE spec: https://gopro.github.io/OpenGoPro/ble/
 *
 * NOTE: This module imports `react-native-ble-plx` lazily so that the web
 * bundle does not break. On web (Vercel) this client is never instantiated;
 * the API layer falls back to the mock or bridge clients instead.
 */

import { Platform } from 'react-native';
import {
  CameraId,
  CameraStatus,
  CameraCommandResult,
  RecordingSession,
  PairedBleDevice,
  CAMERA_IDS,
  defaultCameraStatus,
} from './types';

// ─── GoPro BLE GATT identifiers ────────────────────────────────────────────────
// "GP-XXXX" is shorthand for b5f9XXXX-aa8d-11e3-9046-0002a5d5c51b
function gp(uuid: string): string {
  return `b5f9${uuid}-aa8d-11e3-9046-0002a5d5c51b`;
}

export const GOPRO_SERVICE_ADV = 'fea6'; // 16-bit advertised service UUID

const SVC_CONTROL_QUERY = 'fea6';
const CHR_COMMAND = gp('0072');
const CHR_COMMAND_RESPONSE = gp('0073');
const CHR_QUERY = gp('0076');
const CHR_QUERY_RESPONSE = gp('0077');

// Commands (ID is the first byte of the TLV-style payload)
const CMD_SET_SHUTTER = 0x01;
const CMD_SLEEP = 0x05;
const CMD_GET_HW_INFO = 0x3c;
const CMD_KEEP_ALIVE = 0x5b;

// Query IDs
const QRY_GET_STATUS_VALUES = 0x13;

// GoPro status IDs we care about
const STATUS_BATTERY = 70; // "Internal battery percentage" — uint8
const STATUS_RECORDING = 8; // "System busy" — but more reliably: 70 = encoding
const STATUS_ENCODING = 10; // 1 = encoding (recording video), 0 = idle
const STATUS_SD_REMAINING = 54; // SD card remaining bytes — uint64
const STATUS_SD_TOTAL = 117; // SD card total bytes — uint64

// Open GoPro BLE response packet: [length, ...payload]. For commands the
// payload is [commandId, status, ...]. Status 0 == success.

// Helpers ─────────────────────────────────────────────────────────────────────

function toBase64(bytes: number[]): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  // Fallback (only used in web/test environments)
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return typeof btoa === 'function' ? btoa(bin) : bin;
}

function fromBase64(b64: string): number[] {
  if (typeof Buffer !== 'undefined') return Array.from(Buffer.from(b64, 'base64'));
  // eslint-disable-next-line no-undef
  const bin = typeof atob === 'function' ? atob(b64) : '';
  return Array.from(bin).map((c) => c.charCodeAt(0));
}

function buildCommandFrame(commandId: number, params: number[] = []): number[] {
  // Format: [length, commandId, ...params]. length = 1 (commandId) + params.length.
  const length = 1 + params.length;
  return [length, commandId, ...params];
}

// ─── Lazy native loader ───────────────────────────────────────────────────────

interface NativeBleApi {
  BleManager: any;
  Device: any;
  State: any;
}

let nativeApi: NativeBleApi | null = null;
let nativeLoadAttempted = false;

function loadNative(): NativeBleApi | null {
  if (nativeLoadAttempted) return nativeApi;
  nativeLoadAttempted = true;
  if (Platform.OS === 'web') return null;
  try {
    // Lazy require so the web bundler never tries to resolve the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx');
    nativeApi = {
      BleManager: mod.BleManager,
      Device: mod.Device,
      State: mod.State,
    };
    return nativeApi;
  } catch {
    return null;
  }
}

export function isBleAvailable(): boolean {
  return loadNative() !== null;
}

// ─── Per-camera BLE handle ────────────────────────────────────────────────────

interface CameraBleHandle {
  cameraId: CameraId;
  bleId: string;
  device: any | null;
  status: CameraStatus;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
  pendingCommand: ((payload: number[]) => void) | null;
  pendingQuery: ((payload: number[]) => void) | null;
}

// ─── BleGoProClient ───────────────────────────────────────────────────────────

export class BleGoProClient {
  private manager: any | null;
  private handles: Map<CameraId, CameraBleHandle> = new Map();
  private activeSession: RecordingSession | null = null;
  private sessionHistory: RecordingSession[] = [];
  private statusListeners: Array<(cameras: CameraStatus[]) => void> = [];
  private sessionListeners: Array<(s: RecordingSession | null) => void> = [];

  constructor(paired: PairedBleDevice[]) {
    const native = loadNative();
    if (!native) {
      this.manager = null;
      return;
    }
    this.manager = new native.BleManager();
    for (const id of CAMERA_IDS) {
      const p = paired.find((d) => d.cameraId === id);
      this.handles.set(id, {
        cameraId: id,
        bleId: p?.bleId ?? '',
        device: null,
        status: { ...defaultCameraStatus(id), name: p?.name ?? `GoPro ${id}` },
        keepAliveTimer: null,
        pendingCommand: null,
        pendingQuery: null,
      });
    }
  }

  available(): boolean {
    return this.manager !== null;
  }

  // ─── Discovery ────────────────────────────────────────────────────────────
  async scan(timeoutMs = 8000): Promise<Array<{ bleId: string; name: string; rssi: number | null }>> {
    if (!this.manager) throw new Error('BLE not available on this platform');
    await this.waitForPoweredOn();

    const found = new Map<string, { bleId: string; name: string; rssi: number | null }>();

    return new Promise((resolve, reject) => {
      const stop = () => {
        try { this.manager.stopDeviceScan(); } catch { /* ignore */ }
      };
      const timer = setTimeout(() => {
        stop();
        resolve(Array.from(found.values()));
      }, timeoutMs);

      this.manager.startDeviceScan([SVC_CONTROL_QUERY], null, (err: Error | null, device: any) => {
        if (err) {
          clearTimeout(timer);
          stop();
          reject(err);
          return;
        }
        if (!device) return;
        const name: string = device.name ?? device.localName ?? '';
        if (!name) return;
        if (!found.has(device.id)) {
          found.set(device.id, { bleId: device.id, name, rssi: device.rssi ?? null });
        }
      });
    });
  }

  private async waitForPoweredOn(): Promise<void> {
    const native = loadNative();
    if (!this.manager || !native) throw new Error('BLE manager not initialised');
    const state = await this.manager.state();
    if (state === native.State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      const sub = this.manager.onStateChange((s: string) => {
        if (s === native.State.PoweredOn) {
          sub.remove();
          resolve();
        } else if (s === native.State.Unsupported) {
          sub.remove();
          reject(new Error('Bluetooth not supported on this device'));
        }
      }, true);
    });
  }

  // ─── Pairing ──────────────────────────────────────────────────────────────
  async pair(cameraId: CameraId, bleId: string, name: string): Promise<PairedBleDevice> {
    const handle = this.handles.get(cameraId);
    if (!handle) throw new Error(`Unknown camera id ${cameraId}`);
    handle.bleId = bleId;
    handle.status.name = name;
    return { cameraId, bleId, name, pairedAt: new Date().toISOString() };
  }

  // ─── Connect / disconnect ────────────────────────────────────────────────
  async connect(cameraId: CameraId): Promise<CameraCommandResult> {
    const start = Date.now();
    const handle = this.handles.get(cameraId);
    if (!handle) return failure(cameraId, 'connect', start, 'Unknown camera');
    if (!this.manager) return failure(cameraId, 'connect', start, 'BLE not available');
    if (!handle.bleId) return failure(cameraId, 'connect', start, 'Camera not paired — open Settings → Pair Cameras');

    handle.status.connectionState = 'connecting';
    this.emitStatus();

    try {
      await this.waitForPoweredOn();
      const device = await this.manager.connectToDevice(handle.bleId, { autoConnect: false, timeout: 8000 });
      await device.discoverAllServicesAndCharacteristics();

      handle.device = device;
      handle.status.connectionState = 'connected';
      handle.status.isOnline = true;
      handle.status.connectionType = 'ble';
      handle.status.lastCommand = 'connect';
      handle.status.lastCommandAt = new Date().toISOString();
      handle.status.errorMessage = null;

      await this.subscribe(handle);
      this.startKeepAlive(handle);

      device.onDisconnected(() => {
        handle.status.connectionState = 'disconnected';
        handle.status.isOnline = false;
        handle.device = null;
        this.stopKeepAlive(handle);
        this.emitStatus();
      });

      this.emitStatus();
      this.refreshStatusInBackground(cameraId);
      return success(cameraId, 'connect', start);
    } catch (err) {
      handle.status.connectionState = 'error';
      handle.status.errorMessage = errMsg(err);
      this.emitStatus();
      return failure(cameraId, 'connect', start, errMsg(err));
    }
  }

  async disconnect(cameraId: CameraId): Promise<CameraCommandResult> {
    const start = Date.now();
    const handle = this.handles.get(cameraId);
    if (!handle) return failure(cameraId, 'disconnect', start, 'Unknown camera');
    try {
      this.stopKeepAlive(handle);
      if (handle.device) await handle.device.cancelConnection();
      handle.device = null;
      handle.status.connectionState = 'disconnected';
      handle.status.recordingState = 'idle';
      handle.status.isOnline = false;
      this.emitStatus();
      return success(cameraId, 'disconnect', start);
    } catch (err) {
      return failure(cameraId, 'disconnect', start, errMsg(err));
    }
  }

  // ─── Recording ────────────────────────────────────────────────────────────
  async startRecording(cameraId: CameraId, _sessionId?: string): Promise<CameraCommandResult> {
    return this.shutter(cameraId, true);
  }

  async stopRecording(cameraId: CameraId, _sessionId?: string): Promise<CameraCommandResult> {
    return this.shutter(cameraId, false);
  }

  private async shutter(cameraId: CameraId, on: boolean): Promise<CameraCommandResult> {
    const start = Date.now();
    const command = on ? 'startRecording' : 'stopRecording';
    const handle = this.handles.get(cameraId);
    if (!handle) return failure(cameraId, command, start, 'Unknown camera');
    if (!handle.device) return failure(cameraId, command, start, 'Camera not connected');

    try {
      const frame = buildCommandFrame(CMD_SET_SHUTTER, [on ? 0x01 : 0x00]);
      const resp = await this.writeCommandAndWait(handle, frame, 4000);
      const status = resp[1] ?? 0xff;
      if (status !== 0) {
        return failure(cameraId, command, start, `Camera rejected shutter (status ${status})`);
      }
      handle.status.recordingState = on ? 'recording' : 'idle';
      handle.status.lastCommand = command;
      handle.status.lastCommandAt = new Date().toISOString();
      handle.status.errorMessage = null;
      this.emitStatus();
      return success(cameraId, command, start);
    } catch (err) {
      return failure(cameraId, command, start, errMsg(err));
    }
  }

  // ─── Status query ─────────────────────────────────────────────────────────
  async refreshStatus(cameraId: CameraId): Promise<CameraCommandResult> {
    const start = Date.now();
    const handle = this.handles.get(cameraId);
    if (!handle) return failure(cameraId, 'refreshStatus', start, 'Unknown camera');
    if (!handle.device) return failure(cameraId, 'refreshStatus', start, 'Camera not connected');

    try {
      // Request status values for: encoding, battery, sd remaining, sd total
      const ids = [STATUS_ENCODING, STATUS_BATTERY, STATUS_SD_REMAINING, STATUS_SD_TOTAL];
      const frame = [1 + ids.length, QRY_GET_STATUS_VALUES, ...ids];
      const resp = await this.writeQueryAndWait(handle, frame, 4000);
      this.applyStatusResponse(handle, resp);
      this.emitStatus();
      return success(cameraId, 'refreshStatus', start);
    } catch (err) {
      return failure(cameraId, 'refreshStatus', start, errMsg(err));
    }
  }

  private applyStatusResponse(handle: CameraBleHandle, payload: number[]): void {
    // Format: [queryId, status, then repeating: statusId, len, ...value]
    if (payload.length < 2) return;
    let i = 2;
    while (i < payload.length) {
      const sid = payload[i++];
      const len = payload[i++];
      if (len === undefined || i + len > payload.length) break;
      const value = payload.slice(i, i + len);
      i += len;
      if (sid === STATUS_ENCODING && value.length >= 1) {
        handle.status.recordingState = value[0] === 1 ? 'recording' : 'idle';
      } else if (sid === STATUS_BATTERY && value.length >= 1) {
        handle.status.batteryPercent = value[0];
      } else if (sid === STATUS_SD_REMAINING && value.length === 8) {
        const remBytes = readU64(value);
        if (handle.status.storageTotalMB !== null) {
          handle.status.storageUsedMB = Math.max(0, handle.status.storageTotalMB - Math.round(remBytes / (1024 * 1024)));
        }
      } else if (sid === STATUS_SD_TOTAL && value.length === 8) {
        const totBytes = readU64(value);
        handle.status.storageTotalMB = Math.round(totBytes / (1024 * 1024));
      }
    }
  }

  private refreshStatusInBackground(cameraId: CameraId): void {
    void this.refreshStatus(cameraId).catch(() => undefined);
  }

  // ─── BLE I/O plumbing ────────────────────────────────────────────────────
  private async subscribe(handle: CameraBleHandle): Promise<void> {
    if (!handle.device) return;
    handle.device.monitorCharacteristicForService(
      SVC_CONTROL_QUERY,
      CHR_COMMAND_RESPONSE,
      (_err: Error | null, char: any) => {
        if (!char?.value) return;
        const bytes = fromBase64(char.value);
        if (handle.pendingCommand) handle.pendingCommand(bytes);
      },
    );
    handle.device.monitorCharacteristicForService(
      SVC_CONTROL_QUERY,
      CHR_QUERY_RESPONSE,
      (_err: Error | null, char: any) => {
        if (!char?.value) return;
        const bytes = fromBase64(char.value);
        if (handle.pendingQuery) handle.pendingQuery(bytes);
      },
    );
  }

  private writeCommandAndWait(
    handle: CameraBleHandle,
    frame: number[],
    timeoutMs: number,
  ): Promise<number[]> {
    return this.writeAndWait(handle, frame, CHR_COMMAND, 'pendingCommand', timeoutMs);
  }

  private writeQueryAndWait(
    handle: CameraBleHandle,
    frame: number[],
    timeoutMs: number,
  ): Promise<number[]> {
    return this.writeAndWait(handle, frame, CHR_QUERY, 'pendingQuery', timeoutMs);
  }

  private async writeAndWait(
    handle: CameraBleHandle,
    frame: number[],
    writeUuid: string,
    pendingKey: 'pendingCommand' | 'pendingQuery',
    timeoutMs: number,
  ): Promise<number[]> {
    if (!handle.device) throw new Error('Camera disconnected');
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        handle[pendingKey] = null;
        reject(new Error(`BLE response timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      handle[pendingKey] = (payload: number[]) => {
        clearTimeout(timer);
        handle[pendingKey] = null;
        // Strip leading length byte for caller convenience.
        resolve(payload.slice(1));
      };
      handle.device
        .writeCharacteristicWithResponseForService(SVC_CONTROL_QUERY, writeUuid, toBase64(frame))
        .catch((err: Error) => {
          clearTimeout(timer);
          handle[pendingKey] = null;
          reject(err);
        });
    });
  }

  private startKeepAlive(handle: CameraBleHandle): void {
    this.stopKeepAlive(handle);
    handle.keepAliveTimer = setInterval(() => {
      if (!handle.device) return;
      const frame = buildCommandFrame(CMD_KEEP_ALIVE, [0x42]);
      handle.device
        .writeCharacteristicWithResponseForService(SVC_CONTROL_QUERY, CHR_COMMAND, toBase64(frame))
        .catch(() => undefined);
    }, 3000);
  }

  private stopKeepAlive(handle: CameraBleHandle): void {
    if (handle.keepAliveTimer) {
      clearInterval(handle.keepAliveTimer);
      handle.keepAliveTimer = null;
    }
  }

  // ─── Bulk operations ─────────────────────────────────────────────────────
  async connectAll(): Promise<CameraCommandResult[]> {
    const targets = CAMERA_IDS.filter((id) => this.handles.get(id)?.bleId);
    return Promise.all(targets.map((id) => this.connect(id)));
  }

  async startAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession }> {
    const sessionId = uuid();
    const startedAt = new Date().toISOString();
    const targets = CAMERA_IDS.filter((id) => this.handles.get(id)?.device);

    const before = Date.now();
    const stamps: number[] = [];
    const results = await Promise.all(
      targets.map(async (id) => {
        const r = await this.startRecording(id, sessionId);
        stamps.push(Date.now());
        return r;
      }),
    );
    const spreadMs = stamps.length > 1 ? Math.max(...stamps) - Math.min(...stamps) : Date.now() - before;

    this.activeSession = {
      id: sessionId,
      startedAt,
      stoppedAt: null,
      durationMs: null,
      cameraIds: targets,
      commandSpreadMs: spreadMs,
    };
    this.sessionHistory.push(this.activeSession);
    this.emitSession();
    return { results, session: this.activeSession };
  }

  async stopAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession | null }> {
    const targets = CAMERA_IDS.filter((id) => this.handles.get(id)?.device);
    const results = await Promise.all(targets.map((id) => this.stopRecording(id, this.activeSession?.id)));
    if (this.activeSession) {
      this.activeSession.stoppedAt = new Date().toISOString();
      this.activeSession.durationMs =
        new Date(this.activeSession.stoppedAt).getTime() - new Date(this.activeSession.startedAt).getTime();
    }
    const ended = this.activeSession;
    this.activeSession = null;
    this.emitSession();
    return { results, session: ended };
  }

  async statusAll(): Promise<CameraStatus[]> {
    const cameras: CameraStatus[] = [];
    for (const id of CAMERA_IDS) {
      const handle = this.handles.get(id);
      if (!handle) continue;
      if (handle.device) await this.refreshStatus(id).catch(() => undefined);
      cameras.push({ ...handle.status });
    }
    return cameras;
  }

  async getCameras(): Promise<CameraStatus[]> {
    return CAMERA_IDS.map((id) => ({ ...(this.handles.get(id)?.status ?? defaultCameraStatus(id)) }));
  }

  async getCamera(cameraId: CameraId): Promise<CameraStatus> {
    return { ...(this.handles.get(cameraId)?.status ?? defaultCameraStatus(cameraId)) };
  }

  async health() {
    const cameras: Record<string, string> = {};
    for (const id of CAMERA_IDS) {
      cameras[id] = this.handles.get(id)?.status.connectionState ?? 'disconnected';
    }
    return {
      status: 'ok' as const,
      version: '1.0.0-ble',
      uptime: 0,
      cameras,
      mode: 'ble' as const,
    };
  }

  async getActiveSession(): Promise<RecordingSession | null> {
    return this.activeSession ? { ...this.activeSession } : null;
  }

  async getSessions(): Promise<RecordingSession[]> {
    return [...this.sessionHistory];
  }

  // ─── Live updates ────────────────────────────────────────────────────────
  onStatus(listener: (cameras: CameraStatus[]) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  onSession(listener: (s: RecordingSession | null) => void): () => void {
    this.sessionListeners.push(listener);
    return () => {
      this.sessionListeners = this.sessionListeners.filter((l) => l !== listener);
    };
  }

  private emitStatus(): void {
    const snapshot = CAMERA_IDS.map(
      (id) => ({ ...(this.handles.get(id)?.status ?? defaultCameraStatus(id)) }),
    );
    this.statusListeners.forEach((l) => l(snapshot));
  }

  private emitSession(): void {
    const snap = this.activeSession ? { ...this.activeSession } : null;
    this.sessionListeners.forEach((l) => l(snap));
  }

  destroy(): void {
    for (const h of this.handles.values()) {
      this.stopKeepAlive(h);
      try { h.device?.cancelConnection(); } catch { /* ignore */ }
    }
    try { this.manager?.destroy(); } catch { /* ignore */ }
    this.statusListeners = [];
    this.sessionListeners = [];
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readU64(bytes: number[]): number {
  // Big-endian 8-byte length value. Cap at 2^53 to stay in safe integer range.
  let v = 0;
  for (let i = 0; i < bytes.length; i++) v = v * 256 + bytes[i];
  return v;
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function success(cameraId: CameraId, command: string, start: number): CameraCommandResult {
  return {
    success: true,
    cameraId,
    command,
    latencyMs: Date.now() - start,
    errorCode: null,
    errorMessage: null,
  };
}

function failure(cameraId: CameraId, command: string, start: number, msg: string): CameraCommandResult {
  return {
    success: false,
    cameraId,
    command,
    latencyMs: Date.now() - start,
    errorCode: 'BLE_ERROR',
    errorMessage: msg,
  };
}
