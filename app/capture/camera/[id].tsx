import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Link, Link2Off, Play, Square, RefreshCw } from 'lucide-react-native';

import { CameraId, CameraStatus, CommandLogEntry, defaultCameraStatus } from '@/lib/capture/types';
import * as Api from '@/lib/capture/api';
import { StatusBadge } from '@/components/capture/StatusBadge';
import { BatteryPill } from '@/components/capture/BatteryPill';
import { PreviewPanel } from '@/components/capture/PreviewPanel';
import {
  formatStorage,
  formatStoragePercent,
  formatRelativeTime,
  formatLatency,
  formatTimestamp,
} from '@/lib/capture/formatting';

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function CameraDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cameraId = parseInt(id ?? '1', 10) as CameraId;

  const [camera, setCamera] = useState<CameraStatus>(defaultCameraStatus(cameraId));
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const addLog = (
    command: string,
    success: boolean,
    latencyMs: number | null,
    errorMessage?: string | null,
  ) => {
    const entry: CommandLogEntry = {
      id: uuid(),
      cameraId,
      command,
      issuedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      latencyMs,
      success,
      errorCode: null,
      errorMessage: errorMessage ?? null,
      sessionId: null,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  };

  const refresh = async () => {
    try {
      const updated = await Api.fetchCameras();
      const found = updated.find((c) => c.id === cameraId);
      if (found) setCamera(found);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [cameraId]);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const handleConnect = () =>
    withBusy(async () => {
      const r = await Api.connectCamera(cameraId);
      addLog('connect', r.success, r.latencyMs, r.errorMessage);
      await refresh();
    });

  const handleDisconnect = () =>
    withBusy(async () => {
      const r = await Api.disconnectCamera(cameraId);
      addLog('disconnect', r.success, r.latencyMs, r.errorMessage);
      await refresh();
    });

  const handleStart = () =>
    withBusy(async () => {
      const r = await Api.startCameraRecording(cameraId);
      addLog('startRecording', r.success, r.latencyMs, r.errorMessage);
      await refresh();
    });

  const handleStop = () =>
    withBusy(async () => {
      const r = await Api.stopCameraRecording(cameraId);
      addLog('stopRecording', r.success, r.latencyMs, r.errorMessage);
      await refresh();
    });

  const handleRefresh = () =>
    withBusy(async () => {
      const r = await Api.refreshCameraStatus(cameraId);
      addLog('refreshStatus', r.success, r.latencyMs, r.errorMessage);
      await refresh();
    });

  const isConnected = camera.connectionState === 'connected';
  const isRecording = camera.recordingState === 'recording';
  const storagePercent = formatStoragePercent(camera.storageUsedMB, camera.storageTotalMB);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color="#9ca3af" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.cameraName}>{camera.name}</Text>
            {camera.model && <Text style={styles.model}>{camera.model}</Text>}
          </View>
          {busy && <ActivityIndicator color="#60a5fa" />}
        </View>

        {/* Preview */}
        <PreviewPanel cameraId={cameraId} isRecording={isRecording} />

        {/* Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <View style={styles.statGrid}>
            <StatRow label="Connection">
              <StatusBadge connectionState={camera.connectionState} />
            </StatRow>
            <StatRow label="Recording">
              <StatusBadge recordingState={camera.recordingState} />
            </StatRow>
            <StatRow label="Battery">
              <BatteryPill percent={camera.batteryPercent} />
            </StatRow>
            <StatRow label="Storage">
              <View style={styles.storageCell}>
                <Text style={styles.statValue}>
                  {formatStorage(camera.storageUsedMB, camera.storageTotalMB)}
                </Text>
                <View style={styles.storageBar}>
                  <View
                    style={[
                      styles.storageBarFill,
                      {
                        width: `${storagePercent}%` as `${number}%`,
                        backgroundColor: storagePercent > 85 ? '#ef4444' : '#60a5fa',
                      },
                    ]}
                  />
                </View>
              </View>
            </StatRow>
            <StatRow label="Connection type">
              <Text style={styles.statValue}>{camera.connectionType.toUpperCase()}</Text>
            </StatRow>
            {camera.firmwareVersion && (
              <StatRow label="Firmware">
                <Text style={styles.statValue}>{camera.firmwareVersion}</Text>
              </StatRow>
            )}
          </View>

          {camera.errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{camera.errorMessage}</Text>
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Controls</Text>
          <View style={styles.controlGrid}>
            {!isConnected ? (
              <ControlBtn label="Connect" icon={<Link size={18} color="#60a5fa" />} onPress={handleConnect} disabled={busy} color="#60a5fa" />
            ) : (
              <ControlBtn label="Disconnect" icon={<Link2Off size={18} color="#9ca3af" />} onPress={handleDisconnect} disabled={busy} color="#9ca3af" />
            )}
            {isConnected && !isRecording && (
              <ControlBtn label="Start" icon={<Play size={18} color="#10b981" />} onPress={handleStart} disabled={busy} color="#10b981" />
            )}
            {isRecording && (
              <ControlBtn label="Stop" icon={<Square size={18} color="#ef4444" />} onPress={handleStop} disabled={busy} color="#ef4444" />
            )}
            <ControlBtn label="Refresh" icon={<RefreshCw size={18} color="#9ca3af" />} onPress={handleRefresh} disabled={busy} color="#9ca3af" />
          </View>
        </View>

        {/* Last command */}
        {camera.lastCommand && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last Command</Text>
            <Text style={styles.lastCmd}>{camera.lastCommand}</Text>
            <Text style={styles.lastCmdTime}>{formatRelativeTime(camera.lastCommandAt)}</Text>
          </View>
        )}

        {/* Command history */}
        {logs.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Command History</Text>
            {logs.map((l) => (
              <View key={l.id} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: l.success ? '#10b981' : '#ef4444' }]} />
                <View style={styles.logInfo}>
                  <Text style={styles.logCmd}>{l.command}</Text>
                  <Text style={styles.logMeta}>
                    {formatTimestamp(l.issuedAt)} · {formatLatency(l.latencyMs)}
                  </Text>
                  {l.errorMessage && <Text style={styles.logErr}>{l.errorMessage}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueCell}>{children}</View>
    </View>
  );
}

interface CtrlBtnProps {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled: boolean;
  color: string;
}

function ControlBtn({ label, icon, onPress, disabled, color }: CtrlBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ctrlBtn,
        { borderColor: color + '44', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon}
      <Text style={[styles.ctrlBtnLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  cameraName: { fontSize: 22, fontWeight: '700', color: '#f9fafb' },
  model: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statGrid: { gap: 12 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: { fontSize: 13, color: '#9ca3af', flex: 1 },
  statValue: { fontSize: 13, color: '#f3f4f6', fontWeight: '500' },
  statValueCell: { alignItems: 'flex-end' },
  storageCell: { alignItems: 'flex-end', gap: 5 },
  storageBar: {
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    overflow: 'hidden',
  },
  storageBarFill: { height: 4, borderRadius: 2 },
  errorBox: {
    backgroundColor: '#ef444415',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ef444430',
  },
  errorText: { fontSize: 12, color: '#f87171' },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ctrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#ffffff08',
  },
  ctrlBtnLabel: { fontSize: 14, fontWeight: '600' },
  lastCmd: { fontSize: 14, color: '#f3f4f6', fontWeight: '500' },
  lastCmdTime: { fontSize: 12, color: '#6b7280' },
  logRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  logInfo: { flex: 1, gap: 2 },
  logCmd: { fontSize: 13, color: '#f3f4f6', fontWeight: '500' },
  logMeta: { fontSize: 11, color: '#6b7280' },
  logErr: { fontSize: 11, color: '#f87171' },
});
