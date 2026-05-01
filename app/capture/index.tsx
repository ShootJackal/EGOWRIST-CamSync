import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScrollText } from 'lucide-react-native';

import {
  BridgeStatus,
  CameraId,
  CameraStatus,
  CommandLogEntry,
  RecordingSession,
  CAMERA_IDS,
  defaultCameraStatus,
} from '@/lib/capture/types';
import { loadBridgeSettings } from '@/lib/capture/storage';
import * as Api from '@/lib/capture/api';

import { BridgeConnectionBanner } from '@/components/capture/BridgeConnectionBanner';
import { RecordingSessionBanner } from '@/components/capture/RecordingSessionBanner';
import { GlobalCaptureControls } from '@/components/capture/GlobalCaptureControls';
import { CameraCard } from '@/components/capture/CameraCard';
import { CommandLogSheet } from '@/components/capture/CommandLogSheet';

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function CaptureDashboard() {
  const router = useRouter();
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('connecting');
  const [cameras, setCameras] = useState<CameraStatus[]>(CAMERA_IDS.map(defaultCameraStatus));
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState<Record<CameraId, boolean>>({ 1: false, 2: false, 3: false });
  const [logsVisible, setLogsVisible] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const log = useCallback(
    (
      cameraId: CameraId | 'all',
      command: string,
      issuedAt: string,
      success: boolean,
      latencyMs: number | null,
      errorMessage?: string | null,
      sessionId?: string | null,
    ) => {
      const entry: CommandLogEntry = {
        id: uuid(),
        cameraId,
        command,
        issuedAt,
        completedAt: new Date().toISOString(),
        latencyMs,
        success,
        errorCode: null,
        errorMessage: errorMessage ?? null,
        sessionId: sessionId ?? null,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 200));
    },
    [],
  );

  const loadSettings = useCallback(async () => {
    const settings = await loadBridgeSettings();
    setBridgeUrl(settings.bridgeUrl);
    Api.initApi(settings);
  }, []);

  const connectToBridge = useCallback(async () => {
    setBridgeStatus('connecting');
    try {
      await Api.checkHealth();
      if (Api.isBleMode()) setBridgeStatus(Api.bleSupportedHere() ? 'ble' : 'unsupported');
      else setBridgeStatus(Api.isMockMode() ? 'mock' : 'connected');
    } catch {
      if (Api.isBleMode()) setBridgeStatus(Api.bleSupportedHere() ? 'ble' : 'unsupported');
      else setBridgeStatus(Api.isMockMode() ? 'mock' : 'unreachable');
    }
  }, []);

  const pollCameras = useCallback(async () => {
    try {
      const updated = await Api.fetchCameras();
      setCameras(updated);
      const active = await Api.getActiveSession();
      setSession(active);
    } catch {
      // Don't crash the poll loop on error
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollCameras, 2000);
  }, [pollCameras]);

  useEffect(() => {
    (async () => {
      await loadSettings();
      await connectToBridge();
      await pollCameras();
      startPolling();

      // Try WebSocket
      const unsub = Api.subscribeToLiveUpdates((data) => {
        const d = data as { type?: string; cameras?: CameraStatus[]; session?: RecordingSession | null };
        if (d.type === 'cameras' && d.cameras) setCameras(d.cameras);
        if (d.type === 'session' && 'session' in d) setSession(d.session ?? null);
      });
      if (unsub) {
        unsubRef.current = unsub;
        // WebSocket connected — slow down polling
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(pollCameras, 5000);
      }
    })();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      unsubRef.current?.();
      Api.destroyApi();
    };
  }, []);

  // ── Global controls ─────────────────────────────────────────────────────────

  const handleConnectAll = async () => {
    const t = new Date().toISOString();
    setGlobalBusy(true);
    try {
      const results = await Api.connectAll();
      results.forEach((r) => log(r.cameraId, 'connect', t, r.success, r.latencyMs, r.errorMessage));
      await pollCameras();
    } finally {
      setGlobalBusy(false);
    }
  };

  const handleStartAll = async () => {
    const t = new Date().toISOString();
    setGlobalBusy(true);
    try {
      const { results, session: newSession } = await Api.startAll();
      results.forEach((r) =>
        log(r.cameraId, 'startRecording', t, r.success, r.latencyMs, r.errorMessage, newSession?.id),
      );
      setSession(newSession);
      await pollCameras();
    } finally {
      setGlobalBusy(false);
    }
  };

  const handleStopAll = async () => {
    const t = new Date().toISOString();
    setGlobalBusy(true);
    try {
      const { results, session: endedSession } = await Api.stopAll();
      results.forEach((r) =>
        log(r.cameraId, 'stopRecording', t, r.success, r.latencyMs, r.errorMessage, endedSession?.id),
      );
      if (endedSession) setSession(endedSession);
      await pollCameras();
    } finally {
      setGlobalBusy(false);
    }
  };

  const handleRefreshAll = async () => {
    setGlobalBusy(true);
    try {
      const updated = await Api.refreshAll();
      setCameras(updated);
    } finally {
      setGlobalBusy(false);
    }
  };

  // ── Per-camera controls ──────────────────────────────────────────────────────

  const setCamBusy = (id: CameraId, v: boolean) =>
    setCameraBusy((prev) => ({ ...prev, [id]: v }));

  const handleConnect = async (id: CameraId) => {
    const t = new Date().toISOString();
    setCamBusy(id, true);
    try {
      const r = await Api.connectCamera(id);
      log(r.cameraId, 'connect', t, r.success, r.latencyMs, r.errorMessage);
      await pollCameras();
    } finally {
      setCamBusy(id, false);
    }
  };

  const handleDisconnect = async (id: CameraId) => {
    const t = new Date().toISOString();
    setCamBusy(id, true);
    try {
      const r = await Api.disconnectCamera(id);
      log(r.cameraId, 'disconnect', t, r.success, r.latencyMs, r.errorMessage);
      await pollCameras();
    } finally {
      setCamBusy(id, false);
    }
  };

  const handleStart = async (id: CameraId) => {
    const t = new Date().toISOString();
    setCamBusy(id, true);
    try {
      const r = await Api.startCameraRecording(id, session?.id);
      log(r.cameraId, 'startRecording', t, r.success, r.latencyMs, r.errorMessage, session?.id);
      await pollCameras();
    } finally {
      setCamBusy(id, false);
    }
  };

  const handleStop = async (id: CameraId) => {
    const t = new Date().toISOString();
    setCamBusy(id, true);
    try {
      const r = await Api.stopCameraRecording(id, session?.id);
      log(r.cameraId, 'stopRecording', t, r.success, r.latencyMs, r.errorMessage, session?.id);
      await pollCameras();
    } finally {
      setCamBusy(id, false);
    }
  };

  const handleRefresh = async (id: CameraId) => {
    setCamBusy(id, true);
    try {
      const t = new Date().toISOString();
      const r = await Api.refreshCameraStatus(id);
      log(r.cameraId, 'refreshStatus', t, r.success, r.latencyMs, r.errorMessage);
      await pollCameras();
    } finally {
      setCamBusy(id, false);
    }
  };

  const isAnyRecording = cameras.some((c) => c.recordingState === 'recording');
  const recentLogs = logs.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>TaskFlow Capture</Text>
          <Pressable onPress={() => setLogsVisible(true)} style={styles.logBtn}>
            <ScrollText size={18} color="#9ca3af" />
          </Pressable>
        </View>

        {/* Connection banner */}
        <BridgeConnectionBanner
          status={bridgeStatus}
          bridgeUrl={bridgeUrl}
          onRetry={connectToBridge}
        />

        {/* Session banner */}
        <RecordingSessionBanner session={session} />

        {/* Global controls */}
        <GlobalCaptureControls
          isRecording={isAnyRecording}
          busy={globalBusy}
          onConnectAll={handleConnectAll}
          onStartAll={handleStartAll}
          onStopAll={handleStopAll}
          onRefreshAll={handleRefreshAll}
        />

        {/* Camera cards */}
        <Text style={styles.sectionLabel}>Cameras</Text>
        {cameras.map((cam) => (
          <CameraCard
            key={cam.id}
            camera={cam}
            busy={cameraBusy[cam.id] || globalBusy}
            onConnect={() => handleConnect(cam.id)}
            onDisconnect={() => handleDisconnect(cam.id)}
            onStart={() => handleStart(cam.id)}
            onStop={() => handleStop(cam.id)}
            onRefresh={() => handleRefresh(cam.id)}
            onSettings={() => router.push(`/capture/camera/${cam.id}`)}
          />
        ))}

        {/* Recent log preview */}
        {recentLogs.length > 0 && (
          <View style={styles.logPreview}>
            <Pressable onPress={() => setLogsVisible(true)} style={styles.logPreviewHeader}>
              <Text style={styles.logPreviewTitle}>Recent Commands</Text>
              <Text style={styles.logPreviewSee}>See all</Text>
            </Pressable>
            {recentLogs.map((l) => (
              <View key={l.id} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: l.success ? '#10b981' : '#ef4444' }]} />
                <Text style={styles.logText} numberOfLines={1}>
                  {l.cameraId === 'all' ? 'All' : `Cam ${l.cameraId}`} · {l.command}
                </Text>
                {l.latencyMs !== null && (
                  <Text style={styles.logLatency}>{l.latencyMs}ms</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <CommandLogSheet
        visible={logsVisible}
        onClose={() => setLogsVisible(false)}
        logs={logs}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
    letterSpacing: -0.5,
  },
  logBtn: {
    padding: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  logPreview: {
    backgroundColor: '#1f2937',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 8,
    gap: 8,
  },
  logPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#d1d5db',
  },
  logPreviewSee: {
    fontSize: 12,
    color: '#60a5fa',
    fontWeight: '500',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logText: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  },
  logLatency: {
    fontSize: 11,
    color: '#4b5563',
  },
});
