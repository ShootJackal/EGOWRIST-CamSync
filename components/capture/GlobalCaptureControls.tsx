import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Link, Play, Square, RefreshCw } from 'lucide-react-native';

interface Props {
  isRecording: boolean;
  busy: boolean;
  onConnectAll: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
  onRefreshAll: () => void;
}

export function GlobalCaptureControls({
  isRecording,
  busy,
  onConnectAll,
  onStartAll,
  onStopAll,
  onRefreshAll,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Primary action: START or STOP */}
        {!isRecording ? (
          <Pressable
            onPress={onStartAll}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.startBtn,
              { opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Play size={22} color="#fff" fill="#fff" />
            )}
            <Text style={styles.primaryLabel}>Start All</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onStopAll}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.stopBtn,
              { opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Square size={22} color="#fff" fill="#fff" />
            )}
            <Text style={styles.primaryLabel}>Stop All</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.secondaryRow}>
        <SecondaryBtn
          icon={<Link size={16} color="#60a5fa" />}
          label="Connect All"
          onPress={onConnectAll}
          disabled={busy}
        />
        <SecondaryBtn
          icon={<RefreshCw size={16} color="#9ca3af" />}
          label="Refresh All"
          onPress={onRefreshAll}
          disabled={busy}
        />
      </View>
    </View>
  );
}

interface SecBtnProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled: boolean;
}

function SecondaryBtn({ icon, label, onPress, disabled }: SecBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.secondaryBtn, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      {icon}
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 20,
  },
  startBtn: {
    backgroundColor: '#10b981',
  },
  stopBtn: {
    backgroundColor: '#ef4444',
  },
  primaryLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#1f293780',
    borderWidth: 1,
    borderColor: '#374151',
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d1d5db',
  },
});
