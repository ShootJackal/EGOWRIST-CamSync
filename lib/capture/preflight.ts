import { CameraStatus, PairedBleDevice } from './types';

export type PreflightSeverity = 'info' | 'warning' | 'blocker';

export interface PreflightIssue {
  cameraId: number;
  cameraName: string;
  severity: PreflightSeverity;
  message: string;
}

export interface PreflightReport {
  ready: boolean; // true if no blockers
  issues: PreflightIssue[];
  // Summary one-liner for the dashboard banner.
  summary: string;
}

export interface PreflightInput {
  paired: PairedBleDevice[];
  cameras: CameraStatus[];
  isBleMode: boolean;
}

const LOW_BATTERY = 30;
const VERY_LOW_BATTERY = 15;
const LOW_STORAGE_PCT = 5; // % free
const NEAR_FULL_STORAGE_PCT = 90; // % used

export function preflight({ paired, cameras, isBleMode }: PreflightInput): PreflightReport {
  const issues: PreflightIssue[] = [];

  const camerasToCheck = isBleMode
    ? cameras.filter((c) => paired.some((p) => p.cameraId === c.id))
    : cameras;

  if (isBleMode && paired.length === 0) {
    return {
      ready: false,
      issues: [],
      summary: 'No cameras paired yet — open Pair Cameras to get started.',
    };
  }

  for (const cam of camerasToCheck) {
    const name = cam.name;

    if (cam.connectionState !== 'connected') {
      issues.push({
        cameraId: cam.id,
        cameraName: name,
        severity: 'blocker',
        message: `${name} is ${cam.connectionState}. Tap Connect All to bring it online.`,
      });
      continue;
    }

    if (cam.batteryPercent !== null) {
      if (cam.batteryPercent <= VERY_LOW_BATTERY) {
        issues.push({
          cameraId: cam.id,
          cameraName: name,
          severity: 'blocker',
          message: `${name} battery is at ${Math.round(cam.batteryPercent)}% — change battery before recording.`,
        });
      } else if (cam.batteryPercent <= LOW_BATTERY) {
        issues.push({
          cameraId: cam.id,
          cameraName: name,
          severity: 'warning',
          message: `${name} battery is low (${Math.round(cam.batteryPercent)}%).`,
        });
      }
    }

    if (cam.storageUsedMB !== null && cam.storageTotalMB !== null && cam.storageTotalMB > 0) {
      const usedPct = (cam.storageUsedMB / cam.storageTotalMB) * 100;
      const freePct = 100 - usedPct;
      if (freePct <= LOW_STORAGE_PCT) {
        issues.push({
          cameraId: cam.id,
          cameraName: name,
          severity: 'blocker',
          message: `${name} SD card is full (${Math.round(usedPct)}% used) — clear it before recording.`,
        });
      } else if (usedPct >= NEAR_FULL_STORAGE_PCT) {
        issues.push({
          cameraId: cam.id,
          cameraName: name,
          severity: 'warning',
          message: `${name} SD card is ${Math.round(usedPct)}% full.`,
        });
      }
    }

    if (cam.errorMessage) {
      issues.push({
        cameraId: cam.id,
        cameraName: name,
        severity: 'warning',
        message: `${name}: ${cam.errorMessage}`,
      });
    }
  }

  const blockers = issues.filter((i) => i.severity === 'blocker');
  const warnings = issues.filter((i) => i.severity === 'warning');

  let summary: string;
  if (blockers.length > 0) {
    summary = blockers.length === 1
      ? blockers[0].message
      : `${blockers.length} cameras need attention before recording`;
  } else if (warnings.length > 0) {
    summary = warnings.length === 1
      ? warnings[0].message
      : `${warnings.length} warnings — review before recording`;
  } else if (camerasToCheck.length === 0) {
    summary = 'All set';
  } else {
    summary = `Ready — ${camerasToCheck.length} camera${camerasToCheck.length === 1 ? '' : 's'} ready to roll`;
  }

  return {
    ready: blockers.length === 0,
    issues,
    summary,
  };
}
