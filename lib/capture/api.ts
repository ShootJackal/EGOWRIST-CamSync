/**
 * Unified API layer. Routes calls to either the real BridgeClient or the
 * in-process MockBridgeClient depending on connection mode.
 */

import { BridgeSettings, CameraId, CameraCommandResult, CameraStatus, RecordingSession } from './types';
import { BridgeClient } from './bridgeClient';
import { mockBridgeClient } from './mockBridgeClient';

type MockClient = typeof mockBridgeClient;

let client: BridgeClient | MockClient | null = null;
let currentSettings: BridgeSettings | null = null;

export function initApi(settings: BridgeSettings): void {
  if (client instanceof BridgeClient) {
    client.destroy();
  }
  currentSettings = settings;
  if (settings.connectionMode === 'mock' || !settings.bridgeUrl) {
    client = mockBridgeClient;
  } else {
    client = new BridgeClient({ bridgeUrl: settings.bridgeUrl, authToken: settings.authToken });
  }
}

function getClient(): BridgeClient | MockClient {
  if (!client) {
    client = mockBridgeClient;
  }
  return client;
}

export function isMockMode(): boolean {
  return currentSettings?.connectionMode === 'mock' || !currentSettings?.bridgeUrl;
}

export async function checkHealth() {
  return getClient().health();
}

export async function fetchCameras(): Promise<CameraStatus[]> {
  return getClient().getCameras();
}

export async function connectCamera(id: CameraId): Promise<CameraCommandResult> {
  return getClient().connect(id);
}

export async function disconnectCamera(id: CameraId): Promise<CameraCommandResult> {
  return getClient().disconnect(id);
}

export async function startCameraRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
  return getClient().startRecording(id, sessionId);
}

export async function stopCameraRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
  return getClient().stopRecording(id, sessionId);
}

export async function refreshCameraStatus(id: CameraId): Promise<CameraCommandResult> {
  return getClient().refreshStatus(id);
}

export async function connectAll(): Promise<CameraCommandResult[]> {
  return getClient().connectAll();
}

export async function startAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession }> {
  return getClient().startAll();
}

export async function stopAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession | null }> {
  return getClient().stopAll();
}

export async function refreshAll(): Promise<CameraStatus[]> {
  return getClient().statusAll();
}

export async function getActiveSession(): Promise<RecordingSession | null> {
  return getClient().getActiveSession();
}

export async function getSessions(): Promise<RecordingSession[]> {
  return getClient().getSessions();
}

export function subscribeToLiveUpdates(
  onUpdate: (data: unknown) => void,
): (() => void) | null {
  const c = getClient();
  if (c instanceof BridgeClient) {
    return c.connectWebSocket(onUpdate);
  }
  return null;
}

export function destroyApi(): void {
  if (client instanceof BridgeClient) {
    client.destroy();
  }
  client = null;
  currentSettings = null;
}
