import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bluetooth, RefreshCw, Check, X } from 'lucide-react-native';

import { CameraId, CAMERA_IDS, PairedBleDevice, BridgeSettings } from '@/lib/capture/types';
import { loadBridgeSettings, saveBridgeSettings } from '@/lib/capture/storage';
import * as Api from '@/lib/capture/api';
import { BleGoProClient, isBleAvailable } from '@/lib/capture/bleClient';

interface ScanItem {
  bleId: string;
  name: string;
  rssi: number | null;
}

export default function PairScreen() {
  const router = useRouter();
  const [bleAvailable] = useState(isBleAvailable());
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<CameraId | null>(null);

  useEffect(() => {
    loadBridgeSettings().then(setSettings);
  }, []);

  const persist = useCallback(async (next: BridgeSettings) => {
    setSettings(next);
    await saveBridgeSettings(next);
    Api.initApi(next);
  }, []);

  const startScan = useCallback(async () => {
    if (!bleAvailable) return;
    setError(null);
    setScanning(true);
    setResults([]);
    try {
      const tmp = new BleGoProClient([]);
      const found = await tmp.scan(8000);
      tmp.destroy();
      setResults(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [bleAvailable]);

  const assign = useCallback(
    async (item: ScanItem) => {
      if (!settings || assignTarget === null) return;
      const next: BridgeSettings = {
        ...settings,
        pairedBleDevices: [
          ...settings.pairedBleDevices.filter((d) => d.cameraId !== assignTarget && d.bleId !== item.bleId),
          { cameraId: assignTarget, bleId: item.bleId, name: item.name, pairedAt: new Date().toISOString() },
        ],
      };
      await persist(next);
      setAssignTarget(null);
    },
    [settings, assignTarget, persist],
  );

  const unpair = useCallback(
    async (cameraId: CameraId) => {
      if (!settings) return;
      const next: BridgeSettings = {
        ...settings,
        pairedBleDevices: settings.pairedBleDevices.filter((d) => d.cameraId !== cameraId),
      };
      await persist(next);
    },
    [settings, persist],
  );

  if (!bleAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => router.back()} />
        <View style={styles.unsupported}>
          <Bluetooth size={42} color="#374151" />
          <Text style={styles.unsupportedTitle}>Direct BLE not available here</Text>
          <Text style={styles.unsupportedText}>
            Direct camera control over Bluetooth requires the native iOS or Android app
            (built from this repo via EAS). The web version on Vercel cannot use Bluetooth
            because Safari and most mobile browsers do not implement Web Bluetooth.
          </Text>
          <Text style={styles.unsupportedText}>
            See README → "Direct BLE (no Mac, no cables)" for the build steps.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const paired = settings?.pairedBleDevices ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Camera slots */}
        <Section title="Cameras">
          {CAMERA_IDS.map((id) => {
            const p = paired.find((d) => d.cameraId === id);
            return (
              <View key={id} style={styles.slot}>
                <View style={styles.slotLeft}>
                  <Text style={styles.slotTitle}>GoPro {id}</Text>
                  {p ? (
                    <>
                      <Text style={styles.slotPaired} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.slotMeta} numberOfLines={1}>{p.bleId}</Text>
                    </>
                  ) : (
                    <Text style={styles.slotEmpty}>Not paired</Text>
                  )}
                </View>
                <View style={styles.slotActions}>
                  {p ? (
                    <Pressable onPress={() => unpair(id)} style={styles.unpairBtn}>
                      <X size={14} color="#ef4444" />
                      <Text style={styles.unpairLabel}>Unpair</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => setAssignTarget(id)}
                    style={[styles.assignBtn, assignTarget === id && styles.assignBtnActive]}
                  >
                    <Text style={[styles.assignLabel, assignTarget === id && styles.assignLabelActive]}>
                      {assignTarget === id ? 'Selecting…' : p ? 'Replace' : 'Assign'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Section>

        {/* Scan */}
        <Section title="Discovered Cameras">
          <Pressable
            onPress={startScan}
            disabled={scanning}
            style={({ pressed }) => [styles.scanBtn, { opacity: scanning ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            {scanning ? <ActivityIndicator color="#fff" /> : <RefreshCw size={16} color="#fff" />}
            <Text style={styles.scanLabel}>{scanning ? 'Scanning…' : 'Scan for GoPros'}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {assignTarget !== null && (
            <Text style={styles.hint}>Tap a discovered camera to assign it as GoPro {assignTarget}.</Text>
          )}
          {results.length === 0 && !scanning && !error ? (
            <Text style={styles.hint}>
              Put each GoPro in pairing mode (Connections → Connect Device → GoPro Quik App), then scan.
            </Text>
          ) : null}
          {results.map((item) => {
            const alreadyPaired = paired.find((d) => d.bleId === item.bleId);
            return (
              <Pressable
                key={item.bleId}
                onPress={() => {
                  if (assignTarget !== null) {
                    void assign(item);
                  } else {
                    Alert.alert('Pick a slot first', 'Tap "Assign" next to GoPro 1, 2, or 3.');
                  }
                }}
                style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Bluetooth size={16} color="#60a5fa" />
                <View style={styles.resultText}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  <Text style={styles.resultId}>{item.bleId}</Text>
                </View>
                {alreadyPaired ? (
                  <View style={styles.resultPaired}>
                    <Check size={12} color="#10b981" />
                    <Text style={styles.resultPairedLabel}>Cam {alreadyPaired.cameraId}</Text>
                  </View>
                ) : item.rssi !== null ? (
                  <Text style={styles.rssi}>{item.rssi} dBm</Text>
                ) : null}
              </Pressable>
            );
          })}
        </Section>

        <Text style={styles.footnote}>
          BLE pairs persist on this phone. The collector only needs to do this once per camera.
          Recording is started/stopped from the Capture tab.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backBtn}>
        <ArrowLeft size={20} color="#9ca3af" />
      </Pressable>
      <Text style={styles.title}>Pair Cameras</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionInner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  backBtn: { padding: 6 },
  title: { fontSize: 22, fontWeight: '700', color: '#f9fafb' },
  content: { padding: 20, gap: 22, paddingBottom: 60 },

  unsupported: { padding: 24, alignItems: 'center', gap: 14 },
  unsupportedTitle: { fontSize: 16, fontWeight: '700', color: '#f3f4f6', marginTop: 8 },
  unsupportedText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 19 },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionInner: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
  },

  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    gap: 8,
  },
  slotLeft: { flex: 1 },
  slotTitle: { fontSize: 14, fontWeight: '700', color: '#f3f4f6' },
  slotPaired: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  slotMeta: { fontSize: 11, color: '#6b7280', marginTop: 1, fontFamily: 'monospace' },
  slotEmpty: { fontSize: 12, color: '#6b7280', marginTop: 2, fontStyle: 'italic' },
  slotActions: { flexDirection: 'row', gap: 6 },
  assignBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#1e3a5f',
  },
  assignBtnActive: { backgroundColor: '#3b82f6' },
  assignLabel: { fontSize: 12, color: '#93c5fd', fontWeight: '600' },
  assignLabelActive: { color: '#fff' },
  unpairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444444',
  },
  unpairLabel: { fontSize: 11, color: '#ef4444', fontWeight: '600' },

  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  scanLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },
  error: { fontSize: 12, color: '#f87171', paddingHorizontal: 14, paddingBottom: 6 },
  hint: { fontSize: 12, color: '#9ca3af', paddingHorizontal: 14, paddingBottom: 8, lineHeight: 18 },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  resultText: { flex: 1 },
  resultName: { fontSize: 13, fontWeight: '600', color: '#f3f4f6' },
  resultId: { fontSize: 10, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 },
  resultPaired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b98115',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  resultPairedLabel: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  rssi: { fontSize: 11, color: '#6b7280' },

  footnote: { fontSize: 12, color: '#6b7280', lineHeight: 18, textAlign: 'center' },
});
