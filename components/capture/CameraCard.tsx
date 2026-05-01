import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Wifi, HardDrive, Play, Square, RefreshCw, Settings, Link, Link2Off } from 'lucide-react-native';
import { CameraStatus } from '@/lib/capture/types';
import { StatusBadge } from './StatusBadge';
import { BatteryPill } from './BatteryPill';
import { formatStorage, formatRelativeTime } from '@/lib/capture/formatting';

interface Props {
  camera: CameraStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  busy?: boolean;
}

export function CameraCard({
  camera,
  onConnect,
  onDisconnect,
  onStart,
  onStop,
  onRefresh,
  onSettings,
  busy = false,
}: Props) {
  const isConnected = camera.connectionState === 'connected';
  const isRecording = camera.recordingState === 'recording';
  const isConnecting = camera.connectionState === 'connecting';

  const cardBorder = isRecording
    ? '#ef444460'
    : isConnected
    ? '#10b98140'
    : '#374151';

  const cardBg = isRecording
    ? '#ef444408'
    : isConnected
    ? '#10b98108'
    : '#1f293740';

  return (
    <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#10b981' : '#374151' }]} />
          <Text style={styles.cameraName}>{camera.name}</Text>
          {camera.model && <Text style={styles.model}>{camera.model}</Text>}
        </View>
        <View style={styles.headerRight}>
          {isConnecting || busy ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : null}
          <BatteryPill percent={camera.batteryPercent} size="sm" />
        </View>
      </View>

      {/* Status row */}
      <View style={styles.statusRow}>
        <StatusBadge connectionState={camera.connectionState} recordingState={camera.recordingState} size="sm" />
        {camera.connectionType !== 'unknown' && (
          <View style={styles.connectionType}>
            <Wifi size={11} color="#9ca3af" />
            <Text style={styles.connectionTypeText}>{camera.connectionType.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Storage */}
      {camera.storageUsedMB !== null && (
        <View style={styles.storageRow}>
          <HardDrive size={11} color="#9ca3af" />
          <Text style={styles.storageText}>
            {formatStorage(camera.storageUsedMB, camera.storageTotalMB)}
          </Text>
        </View>
      )}

      {/* Error */}
      {camera.errorMessage && (
        <Text style={styles.errorText} numberOfLines={2}>{camera.errorMessage}</Text>
      )}

      {/* Last command */}
      {camera.lastCommand && (
        <Text style={styles.lastCmd}>
          Last: {camera.lastCommand} · {formatRelativeTime(camera.lastCommandAt)}
        </Text>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {!isConnected ? (
          <ControlButton
            icon={<Link size={14} color="#60a5fa" />}
            label="Connect"
            onPress={onConnect}
            disabled={isConnecting || busy}
            color="#60a5fa"
          />
        ) : (
          <ControlButton
            icon={<Link2Off size={14} color="#9ca3af" />}
            label="Disconnect"
            onPress={onDisconnect}
            disabled={busy}
            color="#9ca3af"
          />
        )}

        {isConnected && !isRecording && (
          <ControlButton
            icon={<Play size={14} color="#10b981" />}
            label="Start"
            onPress={onStart}
            disabled={busy}
            color="#10b981"
          />
        )}

        {isRecording && (
          <ControlButton
            icon={<Square size={14} color="#ef4444" />}
            label="Stop"
            onPress={onStop}
            disabled={busy}
            color="#ef4444"
          />
        )}

        <ControlButton
          icon={<RefreshCw size={14} color="#9ca3af" />}
          label="Refresh"
          onPress={onRefresh}
          disabled={busy}
          color="#9ca3af"
        />

        <ControlButton
          icon={<Settings size={14} color="#9ca3af" />}
          label="Detail"
          onPress={onSettings}
          disabled={false}
          color="#9ca3af"
        />
      </View>
    </View>
  );
}

interface BtnProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled: boolean;
  color: string;
}

function ControlButton({ icon, label, onPress, disabled, color }: BtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: color + '44', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon}
      <Text style={[styles.btnLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cameraName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f9fafb',
  },
  model: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectionType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  connectionTypeText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  storageText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  errorText: {
    fontSize: 11,
    color: '#f87171',
    backgroundColor: '#ef444415',
    padding: 6,
    borderRadius: 6,
  },
  lastCmd: {
    fontSize: 11,
    color: '#6b7280',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#ffffff08',
  },
  btnLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
