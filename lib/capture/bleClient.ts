/**
 * Direct BLE GoPro client.
 *
 * Speaks the Open GoPro BLE protocol from the phone to each camera, with no
 * Mac, no bridge, and nothing physically attached to the GoPros.
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

const SVC_CONTROL_QUERY = 'fea6';
const CHR_COMMAND = gp('0072');
const CHR_COMMAND_RESPONSE = gp('0073');
const CHR_QUERY = gp('0076');
const CHR_QUERY_RESPONSE = gp('0077');

// Commands (ID is the first byte of the payload)
const CMD_SET_SHUTTER = 0x01;
const CMD_GET_HW_INFO = 0x3c;
const CMD_KEEP_ALIVE = 0x5b;

// Query IDs
const QRY_GET_STATUS_VALUES = 0x13;

// GoPro status IDs we care about (Open GoPro status IDs)
const STATUS_BATTERY = 70; // Internal battery percentage — uint8 (0-100)
const STATUS_ENCODING = 10; // 1 = encoding (recording video), 0 = idle — uint8
const STATUS_SD_REMAINING = 54; // SD card remaining (kB) — uint64
const STATUS_SD_TOTAL = 117; // SD card capacity (kB) — uint64

// Open GoPro BLE framing: a logical message is one or more BLE packets.
// First packet starts with a header byte that encodes total payload length.
//   General 5-bit:    [0b000xxxxx] length=xxxxx (1..0x1F bytes), then payload
//   Extended 13-bit:  [0b001xxxxx, yyyyyyyy] length = (xxxxx<<8)|yyyyyyyy
//   Extended 16-bit:  [0b010xxxxx, h, l] length = (h<<8)|l       (xxxxx must be 0)
// Continuation packets: header byte = [0b1ccccccc] where ccccccc is a 7-bit
// counter (we don't enforce ordering — we just append the rest of the packet).

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBase64(bytes: number[]): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
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

// Build a single-packet command frame: [length, commandId, ...params].
// All commands we send fit in a single packet (≤ 20 bytes).
function buildCommandFrame(commandId: number, params: number[] = []): number[] {
  const length = 1 + params.length;
  return [length, commandId, ...params];
}

// ─── Lazy native loader ───────────────────────────────────────────────────────

interface NativeBleApi {
  BleManager: any;
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
    nativeApi = { BleManager: mod.BleManager, State: mod.State };
    return nativeApi;
  } catch {
    return null;
  }
}

export function isBleAvailable(): boolean {
  return loadNative() !== null;
}

// ─── Per-camera BLE handle ────────────────────────────────────────────────────

interface PendingResponse {
  resolve: (payload: number[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ResponseAccumulator {
  expectedLength: number; // total payload bytes to collect
  buffer: number[]; // payload bytes collected so far (excluding any header bytes)
}

interface CameraBleHandle {
  cameraId: CameraId;
  bleId: string;
  device: any | null;
  status: CameraStatus;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
  // We serialize writes by chaining each request onto the tail promise of
  // the corresponding characteristic. Nothing is ever in flight twice.
  cmdTail: Promise<unknown>;
  qryTail: Promise<unknown>;
  pendingCmd: PendingResponse | null;
  pendingQry: PendingResponse | null;
  cmdAcc: ResponseAccumulator | null;
  qryAcc: ResponseAccumulator | null;
  subscriptions: Array<{ remove: () => void }>;
  disconnectListener: { remove: () => void } | null;
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
      this.handles.set(id, this.makeHandle(id, p));
    }
  }

  private makeHandle(id: CameraId, p?: PairedBleDevice): CameraBleHandle {
    const baseStatus = defaultCameraStatus(id);
    return {
      cameraId: id,
      bleId: p?.bleId ?? '',
      device: null,
      status: {
        ...baseStatus,
        name: displayNameOf(id, p),
        connectionType: p ? 'ble' : baseStatus.connectionType,
      },
      keepAliveTimer: null,
      cmdTail: Promise.resolve(),
      qryTail: Promise.resolve(),
      pendingCmd: null,
      pendingQry: null,
      cmdAcc: null,
      qryAcc: null,
      subscriptions: [],
      disconnectListener: null,
    };
  }

  available(): boolean {
    return this.manager !== null;
  }

  // ─── Discovery ───────────────────────────────────────────────────────────
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
        const existing = found.get(device.id);
        // Keep the strongest RSSI we've seen
        if (!existing || (device.rssi ?? -999) > (existing.rssi ?? -999)) {
          found.set(device.id, { bleId: device.id, name, rssi: device.rssi ?? null });
        }
      });
    });
  }

  private async waitForPoweredOn(timeoutMs = 6000): Promise<void> {
    const native = loadNative();
    if (!this.manager || !native) throw new Error('BLE manager not initialised');
    const state = await this.manager.state();
    if (state === native.State.PoweredOn) return;
    if (state === native.State.Unsupported) {
      throw new Error('Bluetooth not supported on this device');
    }
    if (state === native.State.PoweredOff) {
      throw new Error('Bluetooth is off — turn it on in iOS Settings');
    }
    if (state === native.State.Unauthorized) {
      throw new Error('Bluetooth permission denied — enable it in iOS Settings → Privacy → Bluetooth');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.remove();
        reject(new Error('Timed out waiting for Bluetooth to power on'));
      }, timeoutMs);
      const sub = this.manager.onStateChange((s: string) => {
        if (s === native.State.PoweredOn) {
          clearTimeout(timer);
          sub.remove();
          resolve();
        } else if (s === native.State.Unsupported || s === native.State.Unauthorized || s === native.State.PoweredOff) {
          clearTimeout(timer);
          sub.remove();
          reject(new Error(`Bluetooth state: ${s}`));
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

  updatePaired(paired: PairedBleDevice[]): void {
    for (const id of CAMERA_IDS) {
      const handle = this.handles.get(id);
      if (!handle) continue;
      const p = paired.find((d) => d.cameraId === id);
      handle.bleId = p?.bleId ?? '';
      handle.status.name = displayNameOf(id, p);
    }
    this.emitStatus();
  }

  // ─── Connect / disconnect ────────────────────────────────────────────────
  async connect(cameraId: CameraId): Promise<CameraCommandResult> {
    const start = Date.now();
    const handle = this.handles.get(cameraId);
    if (!handle) return failure(cameraId, 'connect', start, 'Unknown camera');
    if (!this.manager) return failure(cameraId, 'connect', start, 'BLE not available');
    if (!handle.bleId) return failure(cameraId, 'connect', start, 'Camera not paired — open Settings → Pair Cameras');
    if (handle.status.connectionState === 'connected' && handle.device) {
      return success(cameraId, 'connect', start);
    }

    handle.status.connectionState = 'connecting';
    handle.status.errorMessage = null;
    this.emitStatus();

    try {
      await this.waitForPoweredOn();

      // If there's an existing device handle from a prior session, drop it cleanly.
      this.teardownConnection(handle);

      const device = await this.manager.connectToDevice(handle.bleId, { autoConnect: false, timeout: 8000 });
      // Negotiate a larger MTU on Android — iOS handles this transparently.
      if (Platform.OS === 'android' && typeof device.requestMTU === 'function') {
        try { await device.requestMTU(247); } catch { /* tolerated */ }
      }
      await device.discoverAllServicesAndCharacteristics();

      handle.device = device;
      handle.status.connectionState = 'connected';
      handle.status.isOnline = true;
      handle.status.connectionType = 'ble';
      handle.status.lastCommand = 'connect';
      handle.status.lastCommandAt = new Date().toISOString();
      handle.status.errorMessage = null;

      this.subscribe(handle);
      this.startKeepAlive(handle);

      handle.disconnectListener = device.onDisconnected(() => {
        this.handleUnexpectedDisconnect(handle, 'Camera lost connection');
      });

      this.emitStatus();
      // Background status refresh — don't block the connect promise
      this.refreshStatus(cameraId).catch(() => undefined);
      return success(cameraId, 'connect', start);
    } catch (err) {
      handle.status.connectionState = 'error';
      handle.status.errorMessage = errMsg(err);
      handle.status.isOnline = false;
      this.emitStatus();
      return failure(cameraId, 'connect', start, errMsg(err));
    }
  }

  async disconnect(cameraId: CameraId): Promise<CameraCommandResult> {
    const start = Date.now();
    const handle = this.handles.get(cameraId);
    if (!handle) return failure(cameraId, 'disconnect', start, 'Unknown camera');
    try {
      const device = handle.device;
      this.teardownConnection(handle);
      if (device) await device.cancelConnection().catch(() => undefined);
      handle.status.connectionState = 'disconnected';
      handle.status.recordingState = 'idle';
      handle.status.isOnline = false;
      this.emitStatus();
      return success(cameraId, 'disconnect', start);
    } catch (err) {
      return failure(cameraId, 'disconnect', start, errMsg(err));
    }
  }

  private handleUnexpectedDisconnect(handle: CameraBleHandle, reason: string): void {
    handle.status.connectionState = 'disconnected';
    handle.status.recordingState = 'idle';
    handle.status.isOnline = false;
    handle.status.errorMessage = reason;
    this.teardownConnection(handle);
    this.emitStatus();
  }

  private teardownConnection(handle: CameraBleHandle): void {
    this.stopKeepAlive(handle);
    handle.disconnectListener?.remove();
    handle.disconnectListener = null;
    handle.subscriptions.forEach((s) => { try { s.remove(); } catch { /* ignore */ } });
    handle.subscriptions = [];
    // Reject any in-flight waiters so callers don't hang
    if (handle.pendingCmd) {
      clearTimeout(handle.pendingCmd.timer);
      handle.pendingCmd.reject(new Error('Camera disconnected'));
      handle.pendingCmd = null;
    }
    if (handle.pendingQry) {
      clearTimeout(handle.pendingQry.timer);
      handle.pendingQry.reject(new Error('Camera disconnected'));
      handle.pendingQry = null;
    }
    handle.cmdAcc = null;
    handle.qryAcc = null;
    // Reset write-serialization tails — anything queued past a teardown will
    // see device === null and reject immediately.
    handle.cmdTail = Promise.resolve();
    handle.qryTail = Promise.resolve();
    handle.device = null;
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
      const resp = await this.writeCommand(handle, frame, 4000);
      // Response payload: [commandId, status, ...]
      const respCmd = resp[0];
      const status = resp[1] ?? 0xff;
      if (respCmd !== CMD_SET_SHUTTER) {
        return failure(cameraId, command, start, `Unexpected response opcode ${respCmd}`);
      }
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
      const ids = [STATUS_ENCODING, STATUS_BATTERY, STATUS_SD_REMAINING, STATUS_SD_TOTAL];
      const frame = [1 + ids.length, QRY_GET_STATUS_VALUES, ...ids];
      const resp = await this.writeQuery(handle, frame, 4000);
      this.applyStatusResponse(handle, resp);
      this.emitStatus();
      return success(cameraId, 'refreshStatus', start);
    } catch (err) {
      return failure(cameraId, 'refreshStatus', start, errMsg(err));
    }
  }

  private applyStatusResponse(handle: CameraBleHandle, payload: number[]): void {
    // Format after stripping length: [queryId, status, then repeating: statusId, len, ...value]
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
      } else if (sid === STATUS_SD_REMAINING && value.length >= 1) {
        // Status 54 is in kB. Older firmware returns 4 bytes; newer 8.
        const remKB = readUIntBE(value);
        if (handle.status.storageTotalMB !== null) {
          const remMB = Math.round(remKB / 1024);
          handle.status.storageUsedMB = Math.max(0, handle.status.storageTotalMB - remMB);
        }
      } else if (sid === STATUS_SD_TOTAL && value.length >= 1) {
        const totKB = readUIntBE(value);
        handle.status.storageTotalMB = Math.round(totKB / 1024);
      }
    }
  }

  // ─── BLE I/O plumbing ────────────────────────────────────────────────────
  private subscribe(handle: CameraBleHandle): void {
    if (!handle.device) return;
    const subCmd = handle.device.monitorCharacteristicForService(
      SVC_CONTROL_QUERY,
      CHR_COMMAND_RESPONSE,
      (_err: Error | null, char: any) => {
        if (!char?.value) return;
        const bytes = fromBase64(char.value);
        this.feedAccumulator(handle, 'cmd', bytes);
      },
    );
    const subQry = handle.device.monitorCharacteristicForService(
      SVC_CONTROL_QUERY,
      CHR_QUERY_RESPONSE,
      (_err: Error | null, char: any) => {
        if (!char?.value) return;
        const bytes = fromBase64(char.value);
        this.feedAccumulator(handle, 'qry', bytes);
      },
    );
    handle.subscriptions.push(subCmd, subQry);
  }

  // Reassemble multi-packet responses according to the Open GoPro framing.
  private feedAccumulator(handle: CameraBleHandle, kind: 'cmd' | 'qry', packet: number[]): void {
    if (packet.length === 0) return;
    const accKey = kind === 'cmd' ? 'cmdAcc' : 'qryAcc';
    let acc = handle[accKey];

    // Continuation packet: high bit set on header byte
    const isContinuation = (packet[0] & 0x80) === 0x80;

    if (isContinuation) {
      if (!acc) return; // Stray continuation, ignore
      acc.buffer.push(...packet.slice(1));
    } else {
      // Start-of-message packet: parse the variable-width length header
      const h0 = packet[0];
      let payloadStart = 1;
      let totalLength: number;
      const headerType = (h0 >> 5) & 0x07;
      if (headerType === 0b000) {
        // 5-bit length
        totalLength = h0 & 0x1f;
      } else if (headerType === 0b001) {
        // 13-bit length
        if (packet.length < 2) return;
        totalLength = ((h0 & 0x1f) << 8) | packet[1];
        payloadStart = 2;
      } else if (headerType === 0b010) {
        // 16-bit length
        if (packet.length < 3) return;
        totalLength = (packet[1] << 8) | packet[2];
        payloadStart = 3;
      } else {
        return; // Unknown header
      }
      acc = { expectedLength: totalLength, buffer: packet.slice(payloadStart) };
      handle[accKey] = acc;
    }

    if (acc && acc.buffer.length >= acc.expectedLength) {
      const complete = acc.buffer.slice(0, acc.expectedLength);
      handle[accKey] = null;
      const pendingKey = kind === 'cmd' ? 'pendingCmd' : 'pendingQry';
      const pending = handle[pendingKey];
      if (pending) {
        clearTimeout(pending.timer);
        handle[pendingKey] = null;
        pending.resolve(complete);
      }
    }
  }

  private writeCommand(handle: CameraBleHandle, frame: number[], timeoutMs: number): Promise<number[]> {
    const next = handle.cmdTail.then(
      () => this.doWrite(handle, 'cmd', frame, CHR_COMMAND, timeoutMs),
      () => this.doWrite(handle, 'cmd', frame, CHR_COMMAND, timeoutMs),
    );
    handle.cmdTail = next.catch(() => undefined);
    return next;
  }

  private writeQuery(handle: CameraBleHandle, frame: number[], timeoutMs: number): Promise<number[]> {
    const next = handle.qryTail.then(
      () => this.doWrite(handle, 'qry', frame, CHR_QUERY, timeoutMs),
      () => this.doWrite(handle, 'qry', frame, CHR_QUERY, timeoutMs),
    );
    handle.qryTail = next.catch(() => undefined);
    return next;
  }

  private async doWrite(
    handle: CameraBleHandle,
    kind: 'cmd' | 'qry',
    frame: number[],
    writeUuid: string,
    timeoutMs: number,
  ): Promise<number[]> {
    if (!handle.device) throw new Error('Camera disconnected');
    const pendingKey = kind === 'cmd' ? 'pendingCmd' : 'pendingQry';
    const accKey = kind === 'cmd' ? 'cmdAcc' : 'qryAcc';
    handle[accKey] = null;

    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (handle[pendingKey]) {
          handle[pendingKey] = null;
          handle[accKey] = null;
          reject(new Error(`BLE response timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      handle[pendingKey] = { resolve, reject, timer };
      handle.device
        .writeCharacteristicWithResponseForService(SVC_CONTROL_QUERY, writeUuid, toBase64(frame))
        .catch((err: unknown) => {
          if (handle[pendingKey]) {
            clearTimeout(timer);
            handle[pendingKey] = null;
            handle[accKey] = null;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
    });
  }

  private startKeepAlive(handle: CameraBleHandle): void {
    this.stopKeepAlive(handle);
    handle.keepAliveTimer = setInterval(() => {
      if (!handle.device) return;
      // Keep-alive is fire-and-forget but goes through the same queue so it
      // never collides with a real shutter or status write.
      const frame = buildCommandFrame(CMD_KEEP_ALIVE, [0x42]);
      this.writeCommand(handle, frame, 2000).catch(() => undefined);
    }, 3000);
  }

  private stopKeepAlive(handle: CameraBleHandle): void {
    if (handle.keepAliveTimer) {
      clearInterval(handle.keepAliveTimer);
      handle.keepAliveTimer = null;
    }
  }

  // ─── Bulk operations ─────────────────────────────────────────────────────
  pairedCameraIds(): CameraId[] {
    return CAMERA_IDS.filter((id) => !!this.handles.get(id)?.bleId);
  }

  connectedCameraIds(): CameraId[] {
    return CAMERA_IDS.filter((id) => this.handles.get(id)?.status.connectionState === 'connected');
  }

  async connectAll(): Promise<CameraCommandResult[]> {
    const targets = this.pairedCameraIds();
    if (targets.length === 0) return [];
    return Promise.all(targets.map((id) => this.connect(id)));
  }

  async startAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession }> {
    const sessionId = uuid();
    const startedAt = new Date().toISOString();
    const targets = this.connectedCameraIds();

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
    const targets = this.connectedCameraIds();
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
    const refreshes: Array<Promise<unknown>> = [];
    for (const id of this.connectedCameraIds()) {
      refreshes.push(this.refreshStatus(id).catch(() => undefined));
    }
    await Promise.all(refreshes);
    return CAMERA_IDS.map((id) => ({ ...(this.handles.get(id)?.status ?? defaultCameraStatus(id)) }));
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
      this.teardownConnection(h);
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

function displayNameOf(id: CameraId, p?: PairedBleDevice): string {
  if (p?.nickname && p.nickname.trim().length > 0) return p.nickname.trim();
  if (p?.name) return p.name;
  return `GoPro ${id}`;
}

function readUIntBE(bytes: number[]): number {
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
