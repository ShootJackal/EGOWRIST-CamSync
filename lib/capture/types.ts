export type CameraId = 1 | 2 | 3;

export type ConnectionMode = 'local' | 'tunnel' | 'mock';

export type BridgeStatus = 'connected' | 'unreachable' | 'mock' | 'error' | 'connecting';

export type CameraConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type RecordingState = 'idle' | 'recording' | 'stopping' | 'error';

export interface CameraStatus {
  id: CameraId;
  name: string;
  connectionState: CameraConnectionState;
  recordingState: RecordingState;
  batteryPercent: number | null;
  storageUsedMB: number | null;
  storageTotalMB: number | null;
  model: string | null;
  connectionType: 'wifi' | 'usb' | 'ble' | 'unknown';
  lastCommand: string | null;
  lastCommandAt: string | null;
  errorMessage: string | null;
  firmwareVersion: string | null;
  isOnline: boolean;
}

export interface CommandLogEntry {
  id: string;
  cameraId: CameraId | 'all';
  command: string;
  issuedAt: string;
  completedAt: string | null;
  latencyMs: number | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  sessionId: string | null;
}

export interface RecordingSession {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number | null;
  cameraIds: CameraId[];
  commandSpreadMs: number | null;
}

export interface BridgeSettings {
  bridgeUrl: string;
  authToken: string;
  connectionMode: ConnectionMode;
}

export interface BridgeHealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
  cameras: Record<string, CameraConnectionState>;
  mode: 'mock' | 'real';
}

export interface BridgeCamerasResponse {
  cameras: CameraStatus[];
}

export interface CameraCommandResult {
  success: boolean;
  cameraId: CameraId;
  command: string;
  latencyMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  rawResponse?: unknown;
}

export interface BridgeApiError {
  error: string;
  code: string;
  cameraId?: CameraId;
}

export interface ActiveSessionResponse {
  session: RecordingSession | null;
}

export interface SessionsResponse {
  sessions: RecordingSession[];
}

export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
  bridgeUrl: process.env.EXPO_PUBLIC_DEFAULT_BRIDGE_URL ?? '',
  authToken: '',
  connectionMode: 'mock',
};

export const CAMERA_IDS: CameraId[] = [1, 2, 3];

export function defaultCameraStatus(id: CameraId): CameraStatus {
  return {
    id,
    name: `GoPro ${id}`,
    connectionState: 'disconnected',
    recordingState: 'idle',
    batteryPercent: null,
    storageUsedMB: null,
    storageTotalMB: null,
    model: null,
    connectionType: 'unknown',
    lastCommand: null,
    lastCommandAt: null,
    errorMessage: null,
    firmwareVersion: null,
    isOnline: false,
  };
}
