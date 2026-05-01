import { Platform } from 'react-native';

type HapticsModule = {
  ImpactFeedbackStyle: { Light: string; Medium: string; Heavy: string };
  NotificationFeedbackType: { Success: string; Warning: string; Error: string };
  impactAsync: (style: string) => Promise<void>;
  notificationAsync: (type: string) => Promise<void>;
  selectionAsync: () => Promise<void>;
};

let mod: HapticsModule | null = null;
let attempted = false;

function load(): HapticsModule | null {
  if (attempted) return mod;
  attempted = true;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-haptics') as HapticsModule;
    return mod;
  } catch {
    return null;
  }
}

export function tapLight(): void {
  const h = load();
  if (!h) return;
  h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function tapMedium(): void {
  const h = load();
  if (!h) return;
  h.impactAsync(h.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

export function tapHeavy(): void {
  const h = load();
  if (!h) return;
  h.impactAsync(h.ImpactFeedbackStyle.Heavy).catch(() => undefined);
}

export function notifySuccess(): void {
  const h = load();
  if (!h) return;
  h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => undefined);
}

export function notifyWarning(): void {
  const h = load();
  if (!h) return;
  h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function notifyError(): void {
  const h = load();
  if (!h) return;
  h.notificationAsync(h.NotificationFeedbackType.Error).catch(() => undefined);
}
