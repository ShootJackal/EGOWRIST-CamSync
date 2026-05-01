import { CameraController, CameraCommandResult, CameraStatus, MediaItem } from './CameraController';

function delay(ms = 300 + Math.random() * 400): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface MockConfig {
  id: number;
  name: string;
  model?: string;
  batteryPercent?: number;
  storageUsedMB?: number;
  storageTotalMB?: number;
  firmwareVersion?: string;
  injectErrors?: boolean;
}

export class MockCameraController implements CameraController {
  private state: CameraStatus;
  private injectErrors: boolean;

  constructor(config: MockConfig) {
    this.injectErrors = config.injectErrors ?? false;
    this.state = {
      id: config.id,
      name: config.name,
      connectionState: 'disconnected',
      recordingState: 'idle',
      batteryPercent: config.batteryPercent ?? 80,
      storageUsedMB: config.storageUsedMB ?? 10000,
      storageTotalMB: config.storageTotalMB ?? 63488,
      model: config.model ?? 'HERO12 Black',
      connectionType: 'wifi',
      lastCommand: null,
      lastCommandAt: null,
      errorMessage: null,
      firmwareVersion: config.firmwareVersion ?? 'H22.01.01.110.00',
      isOnline: false,
    };
  }

  private result(command: string, start: number, success = true, errorMessage: string | null = null): CameraCommandResult {
    this.state.lastCommand = command;
    this.state.lastCommandAt = new Date().toISOString();
    if (success) {
      this.state.errorMessage = null;
    } else {
      this.state.errorMessage = errorMessage;
    }
    return {
      success,
      cameraId: this.state.id,
      command,
      latencyMs: Date.now() - start,
      errorCode: success ? null : 'MOCK_ERROR',
      errorMessage: success ? null : errorMessage,
    };
  }

  async connect(): Promise<CameraCommandResult> {
    const start = Date.now();
    this.state.connectionState = 'connecting';
    await delay();
    if (this.injectErrors && Math.random() < 0.1) {
      this.state.connectionState = 'error';
      return this.result('connect', start, false, 'Injected connection error');
    }
    this.state.connectionState = 'connected';
    this.state.isOnline = true;
    return this.result('connect', start);
  }

  async disconnect(): Promise<CameraCommandResult> {
    const start = Date.now();
    await delay(80);
    this.state.connectionState = 'disconnected';
    this.state.recordingState = 'idle';
    this.state.isOnline = false;
    return this.result('disconnect', start);
  }

  async getStatus(): Promise<CameraStatus> {
    await delay(60);
    if (this.state.recordingState === 'recording' && this.state.batteryPercent !== null) {
      this.state.batteryPercent = Math.max(0, this.state.batteryPercent - 0.05);
    }
    return { ...this.state };
  }

  async startRecording(sessionId?: string): Promise<CameraCommandResult> {
    const start = Date.now();
    if (this.state.connectionState !== 'connected') {
      return this.result('startRecording', start, false, 'Camera not connected');
    }
    await delay();
    this.state.recordingState = 'recording';
    return this.result('startRecording', start);
  }

  async stopRecording(sessionId?: string): Promise<CameraCommandResult> {
    const start = Date.now();
    await delay();
    this.state.recordingState = 'idle';
    this.state.storageUsedMB = Math.min(
      this.state.storageTotalMB ?? 63488,
      (this.state.storageUsedMB ?? 0) + 256 + Math.random() * 256,
    );
    return this.result('stopRecording', start);
  }

  async listMedia(): Promise<MediaItem[]> {
    await delay(200);
    return [
      { filename: 'GH010001.MP4', sizeMB: 3800, createdAt: new Date().toISOString() },
      { filename: 'GH020001.MP4', sizeMB: 1200, createdAt: new Date().toISOString() },
    ];
  }
}
