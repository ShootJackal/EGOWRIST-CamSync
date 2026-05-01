import { BridgeSettings, DEFAULT_BRIDGE_SETTINGS } from './types';

const SETTINGS_KEY = 'capture:bridge_settings';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export async function loadBridgeSettings(): Promise<BridgeSettings> {
  try {
    const storage = getStorage();
    if (!storage) return DEFAULT_BRIDGE_SETTINGS;
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_BRIDGE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BridgeSettings>;
    return {
      bridgeUrl: parsed.bridgeUrl ?? DEFAULT_BRIDGE_SETTINGS.bridgeUrl,
      authToken: parsed.authToken ?? DEFAULT_BRIDGE_SETTINGS.authToken,
      connectionMode: parsed.connectionMode ?? DEFAULT_BRIDGE_SETTINGS.connectionMode,
    };
  } catch {
    return DEFAULT_BRIDGE_SETTINGS;
  }
}

export async function saveBridgeSettings(settings: BridgeSettings): Promise<void> {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // silently fail on storage errors
  }
}

export async function clearBridgeSettings(): Promise<void> {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(SETTINGS_KEY);
  } catch {
    // silently fail
  }
}
