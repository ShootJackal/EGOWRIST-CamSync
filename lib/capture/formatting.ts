export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatStorage(usedMB: number | null, totalMB: number | null): string {
  if (usedMB === null || totalMB === null) return '—';
  const usedGB = usedMB / 1024;
  const totalGB = totalMB / 1024;
  if (totalGB >= 1) {
    return `${usedGB.toFixed(1)} / ${totalGB.toFixed(0)} GB`;
  }
  return `${usedMB.toFixed(0)} / ${totalMB.toFixed(0)} MB`;
}

export function formatStoragePercent(usedMB: number | null, totalMB: number | null): number {
  if (usedMB === null || totalMB === null || totalMB === 0) return 0;
  return Math.min(100, Math.round((usedMB / totalMB) * 100));
}

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
