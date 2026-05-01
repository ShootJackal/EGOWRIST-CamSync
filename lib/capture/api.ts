/**
 * Unified API layer. Routes calls to one of three clients depending on the
 * current Connection Mode:
 *
 *   - 'ble'     → BleGoProClient (direct BLE from phone, native iOS/Android)
 *   - 'mock'    → mockBridgeClient (in-process simulation, works everywhere)
 *   - default   → BridgeClient (HTTP to a Mac bridge)
 */

import { Platform } from 'react-native';
import {
  BridgeSettings,
  CameraId,
  CameraCommandResult,
  CameraStatus,
  RecordingSession,
} from './types';
import { BridgeClient } from './bridgeClient';
import { mockBridgeClient } from './mockBridgeClient';
import { BleGoProClient, isBleAvailable } from './bleClient';

type MockClient = typeof mockBridgeClient;
type AnyClient = BridgeClient | MockClient | BleGoProClient;

let client: AnyClient | null = null;
let currentSettings: BridgeSettings | null = null;

export function initApi(settings: BridgeSettings): void {
  destroyCurrentClient();
  currentSettings = settings;
  if (settings.connectionMode === 'ble' && isBleAvailable()) {
    client = new BleGoProClient(settings.pairedBleDevices);
  } else if (settings.connectionMode === 'mock' || !settings.bridgeUrl) {
    client = mockBridgeClient;
  } else {
    client = new BridgeClient({ bridgeUrl: settings.bridgeUrl, authToken: settings.authToken });
  }
}

function destroyCurrentClient(): void {
  if (client instanceof BridgeClient) client.destroy();
  if (client instanceof BleGoProClient) client.destroy();
  client = null;
}

function getClient(): AnyClient {
  if (!client) client = mockBridgeClient;
  return client;
}

export function isMockMode(): boolean {
  return currentSettings?.connectionMode === 'mock' || (!currentSettings?.bridgeUrl && currentSettings?.connectionMode !== 'ble');
}

export function isBleMode(): boolean {
  return currentSettings?.connectionMode === 'ble';
}

export function bleSupportedHere(): boolean {
  return Platform.OS !== 'web' && isBleAvailable();
}

export function getBleClient(): BleGoProClient | null {
  return client instanceof BleGoProClient ? client : null;
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
  if (c instanceof BleGoProClient) {
    const offCams = c.onStatus((cameras) => onUpdate({ type: 'cameras', cameras }));
    const offSess = c.onSession((session) => onUpdate({ type: 'session', session }));
    return () => { offCams(); offSess(); };
  }
  return null;
}

export function destroyApi(): void {
  destroyCurrentClient();
  currentSettings = null;
}
