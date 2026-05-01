import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Wifi, WifiOff, FlaskConical, AlertTriangle, Bluetooth } from 'lucide-react-native';
import { BridgeStatus } from '@/lib/capture/types';

interface Props {
  status: BridgeStatus;
  bridgeUrl?: string;
  onRetry?: () => void;
}

const CONFIG: Record<
  BridgeStatus,
  { bg: string; border: string; text: string; icon: React.ReactNode; label: string; sub?: string }
> = {
  connected: {
    bg: '#065f4620',
    border: '#10b98144',
    text: '#10b981',
    icon: <Wifi size={15} color="#10b981" />,
    label: 'Bridge connected',
  },
  unreachable: {
    bg: '#7f1d1d20',
    border: '#ef444444',
    text: '#ef4444',
    icon: <WifiOff size={15} color="#ef4444" />,
    label: 'Bridge unreachable',
    sub: 'Check your bridge URL in Settings',
  },
  mock: {
    bg: '#1e3a5f20',
    border: '#3b82f644',
    text: '#60a5fa',
    icon: <FlaskConical size={15} color="#60a5fa" />,
    label: 'Mock mode',
    sub: 'No bridge required — simulated cameras',
  },
  error: {
    bg: '#7f1d1d20',
    border: '#ef444444',
    text: '#f87171',
    icon: <AlertTriangle size={15} color="#f87171" />,
    label: 'Bridge error',
    sub: 'Check logs or Settings',
  },
  connecting: {
    bg: '#451a0320',
    border: '#f59e0b44',
    text: '#f59e0b',
    icon: <ActivityIndicator size="small" color="#f59e0b" />,
    label: 'Connecting…',
  },
  ble: {
    bg: '#1e3a5f20',
    border: '#3b82f644',
    text: '#60a5fa',
    icon: <Bluetooth size={15} color="#60a5fa" />,
    label: 'Direct BLE',
    sub: 'Phone is talking to GoPros directly — no Mac, no cables',
  },
  unsupported: {
    bg: '#7f1d1d20',
    border: '#ef444444',
    text: '#f87171',
    icon: <AlertTriangle size={15} color="#f87171" />,
    label: 'Direct BLE not supported here',
    sub: 'Open the native iOS/Android app to use Direct BLE',
  },
};

export function BridgeConnectionBanner({ status, bridgeUrl, onRetry }: Props) {
  const cfg = CONFIG[status];
  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.left}>
        {cfg.icon}
        <View style={styles.textGroup}>
          <Text style={[styles.label, { color: cfg.text }]}>{cfg.label}</Text>
          {cfg.sub && <Text style={styles.sub}>{cfg.sub}</Text>}
          {bridgeUrl && status === 'connected' && (
            <Text style={styles.sub} numberOfLines={1}>{bridgeUrl}</Text>
          )}
        </View>
      </View>
      {(status === 'unreachable' || status === 'error') && onRetry && (
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={[styles.retryText, { color: cfg.text }]}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  textGroup: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  sub: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#ffffff10',
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
