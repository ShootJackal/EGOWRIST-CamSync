export type CameraConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type RecordingState = 'idle' | 'recording' | 'stopping' | 'error';

export interface CameraStatus {
  id: number;
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

export interface CameraCommandResult {
  success: boolean;
  cameraId: number;
  command: string;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse?: unknown;
}

export interface MediaItem {
  filename: string;
  sizeMB: number;
  createdAt: string;
}

export interface CameraController {
  connect(): Promise<CameraCommandResult>;
  disconnect(): Promise<CameraCommandResult>;
  getStatus(): Promise<CameraStatus>;
  startRecording(sessionId?: string): Promise<CameraCommandResult>;
  stopRecording(sessionId?: string): Promise<CameraCommandResult>;
  enableWifiIfNeeded?(): Promise<CameraCommandResult>;
  getPreviewStreamUrl?(): Promise<string | null>;
  listMedia?(): Promise<MediaItem[]>;
  downloadLatestMedia?(): Promise<CameraCommandResult>;
}
