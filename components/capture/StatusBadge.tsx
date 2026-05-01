import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraConnectionState, RecordingState } from '@/lib/capture/types';

type BadgeVariant = 'connection' | 'recording';

interface Props {
  connectionState?: CameraConnectionState;
  recordingState?: RecordingState;
  size?: 'sm' | 'md';
}

const CONNECTION_LABELS: Record<CameraConnectionState, string> = {
  disconnected: 'Offline',
  connecting: 'Connecting…',
  connected: 'Online',
  error: 'Error',
};

const RECORDING_LABELS: Record<RecordingState, string> = {
  idle: 'Idle',
  recording: '● REC',
  stopping: 'Stopping…',
  error: 'Error',
};

const CONNECTION_COLORS: Record<CameraConnectionState, string> = {
  disconnected: '#6b7280',
  connecting: '#f59e0b',
  connected: '#10b981',
  error: '#ef4444',
};

const RECORDING_COLORS: Record<RecordingState, string> = {
  idle: '#6b7280',
  recording: '#ef4444',
  stopping: '#f59e0b',
  error: '#ef4444',
};

export function StatusBadge({ connectionState, recordingState, size = 'md' }: Props) {
  const isRecording = recordingState && recordingState !== 'idle';
  const label = isRecording
    ? RECORDING_LABELS[recordingState!]
    : connectionState
    ? CONNECTION_LABELS[connectionState]
    : '—';

  const color = isRecording
    ? RECORDING_COLORS[recordingState!]
    : connectionState
    ? CONNECTION_COLORS[connectionState]
    : '#6b7280';

  const fontSize = size === 'sm' ? 10 : 12;
  const paddingH = size === 'sm' ? 6 : 8;
  const paddingV = size === 'sm' ? 2 : 4;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: color + '22',
          borderColor: color + '55',
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
    >
      <Text style={[styles.label, { color, fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
