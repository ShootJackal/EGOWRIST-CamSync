import {
  CameraId,
  CameraStatus,
  CameraCommandResult,
  RecordingSession,
  CAMERA_IDS,
} from './types';

function delay(ms = 300 + Math.random() * 400): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

interface MockCameraState {
  status: CameraStatus;
}

const initialStates: Record<CameraId, MockCameraState> = {
  1: {
    status: {
      id: 1,
      name: 'GoPro 1',
      connectionState: 'disconnected',
      recordingState: 'idle',
      batteryPercent: 87,
      storageUsedMB: 8200,
      storageTotalMB: 63488,
      model: 'HERO12 Black',
      connectionType: 'wifi',
      lastCommand: null,
      lastCommandAt: null,
      errorMessage: null,
      firmwareVersion: 'H22.01.01.110.00',
      isOnline: false,
    },
  },
  2: {
    status: {
      id: 2,
      name: 'GoPro 2',
      connectionState: 'disconnected',
      recordingState: 'idle',
      batteryPercent: 64,
      storageUsedMB: 22016,
      storageTotalMB: 63488,
      model: 'HERO11 Black',
      connectionType: 'wifi',
      lastCommand: null,
      lastCommandAt: null,
      errorMessage: null,
      firmwareVersion: 'H21.01.01.110.00',
      isOnline: false,
    },
  },
  3: {
    status: {
      id: 3,
      name: 'GoPro 3',
      connectionState: 'disconnected',
      recordingState: 'idle',
      batteryPercent: 31,
      storageUsedMB: 51200,
      storageTotalMB: 63488,
      model: 'HERO12 Black',
      connectionType: 'wifi',
      lastCommand: null,
      lastCommandAt: null,
      errorMessage: null,
      firmwareVersion: 'H22.01.01.110.00',
      isOnline: false,
    },
  },
};

const states: Record<CameraId, MockCameraState> = JSON.parse(JSON.stringify(initialStates));

let activeSession: RecordingSession | null = null;
const sessions: RecordingSession[] = [];

function makeResult(
  cameraId: CameraId,
  command: string,
  latencyMs: number,
  success = true,
  errorMessage: string | null = null,
): CameraCommandResult {
  states[cameraId].status.lastCommand = command;
  states[cameraId].status.lastCommandAt = now();
  if (success) {
    states[cameraId].status.errorMessage = null;
  } else {
    states[cameraId].status.errorMessage = errorMessage;
  }
  return {
    success,
    cameraId,
    command,
    latencyMs,
    errorCode: success ? null : 'MOCK_ERROR',
    errorMessage: success ? null : errorMessage,
  };
}

async function connectCamera(id: CameraId): Promise<CameraCommandResult> {
  const start = Date.now();
  states[id].status.connectionState = 'connecting';
  await delay();
  const latencyMs = Date.now() - start;
  states[id].status.connectionState = 'connected';
  states[id].status.isOnline = true;
  states[id].status.errorMessage = null;
  return makeResult(id, 'connect', latencyMs);
}

async function disconnectCamera(id: CameraId): Promise<CameraCommandResult> {
  const start = Date.now();
  await delay(100);
  const latencyMs = Date.now() - start;
  states[id].status.connectionState = 'disconnected';
  states[id].status.recordingState = 'idle';
  states[id].status.isOnline = false;
  return makeResult(id, 'disconnect', latencyMs);
}

async function startRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
  const start = Date.now();
  if (states[id].status.connectionState !== 'connected') {
    await delay(100);
    return makeResult(id, 'startRecording', Date.now() - start, false, 'Camera not connected');
  }
  await delay();
  const latencyMs = Date.now() - start;
  states[id].status.recordingState = 'recording';
  return makeResult(id, 'startRecording', latencyMs);
}

async function stopRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
  const start = Date.now();
  await delay();
  const latencyMs = Date.now() - start;
  states[id].status.recordingState = 'idle';
  // Simulate storage increase
  states[id].status.storageUsedMB = Math.min(
    states[id].status.storageTotalMB ?? 63488,
    (states[id].status.storageUsedMB ?? 0) + 512 + Math.random() * 512,
  );
  return makeResult(id, 'stopRecording', latencyMs);
}

async function getStatus(id: CameraId): Promise<CameraStatus> {
  await delay(100);
  // Simulate slow battery drain when recording
  if (states[id].status.recordingState === 'recording' && states[id].status.batteryPercent !== null) {
    states[id].status.batteryPercent = Math.max(0, states[id].status.batteryPercent - 0.1);
  }
  return { ...states[id].status };
}

// Public API surface matching bridge HTTP API

export const mockBridgeClient = {
  async health() {
    await delay(50);
    return {
      status: 'ok' as const,
      version: '1.0.0-mock',
      uptime: process.env.NODE_ENV === 'test' ? 0 : Date.now() / 1000,
      cameras: Object.fromEntries(
        CAMERA_IDS.map((id) => [id, states[id].status.connectionState]),
      ),
      mode: 'mock' as const,
    };
  },

  async getCameras(): Promise<CameraStatus[]> {
    await delay(80);
    return CAMERA_IDS.map((id) => ({ ...states[id].status }));
  },

  async getCamera(id: CameraId): Promise<CameraStatus> {
    return getStatus(id);
  },

  async connect(id: CameraId): Promise<CameraCommandResult> {
    return connectCamera(id);
  },

  async disconnect(id: CameraId): Promise<CameraCommandResult> {
    return disconnectCamera(id);
  },

  async startRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
    return startRecording(id, sessionId);
  },

  async stopRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
    return stopRecording(id, sessionId);
  },

  async refreshStatus(id: CameraId): Promise<CameraCommandResult> {
    const start = Date.now();
    await getStatus(id);
    return makeResult(id, 'refreshStatus', Date.now() - start);
  },

  async connectAll(): Promise<CameraCommandResult[]> {
    return Promise.all(CAMERA_IDS.map((id) => connectCamera(id)));
  },

  async startAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession }> {
    const sessionId = uuid();
    const startedAt = now();
    const results = await Promise.all(
      CAMERA_IDS.map((id) => startRecording(id, sessionId)),
    );
    activeSession = {
      id: sessionId,
      startedAt,
      stoppedAt: null,
      durationMs: null,
      cameraIds: CAMERA_IDS,
      commandSpreadMs: Math.round(Math.random() * 120 + 20),
    };
    sessions.push(activeSession);
    return { results, session: activeSession };
  },

  async stopAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession | null }> {
    const results = await Promise.all(CAMERA_IDS.map((id) => stopRecording(id)));
    if (activeSession) {
      activeSession.stoppedAt = now();
      activeSession.durationMs = new Date(activeSession.stoppedAt).getTime() - new Date(activeSession.startedAt).getTime();
      const s = activeSession;
      activeSession = null;
      return { results, session: s };
    }
    return { results, session: null };
  },

  async statusAll(): Promise<CameraStatus[]> {
    return Promise.all(CAMERA_IDS.map((id) => getStatus(id)));
  },

  async getActiveSession(): Promise<RecordingSession | null> {
    await delay(50);
    return activeSession ? { ...activeSession } : null;
  },

  async getSessions(): Promise<RecordingSession[]> {
    await delay(50);
    return [...sessions];
  },

  reset() {
    CAMERA_IDS.forEach((id) => {
      states[id] = JSON.parse(JSON.stringify(initialStates[id]));
    });
    activeSession = null;
    sessions.length = 0;
  },
};
