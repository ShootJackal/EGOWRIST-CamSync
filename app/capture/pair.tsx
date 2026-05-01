import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  TextInput,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bluetooth, RefreshCw, Check, X, Pencil } from 'lucide-react-native';

import { CameraId, CAMERA_IDS, PairedBleDevice, BridgeSettings } from '@/lib/capture/types';
import { loadBridgeSettings, saveBridgeSettings } from '@/lib/capture/storage';
import * as Api from '@/lib/capture/api';
import { BleGoProClient, isBleAvailable } from '@/lib/capture/bleClient';

interface ScanItem {
  bleId: string;
  name: string;
  rssi: number | null;
}

const PLACEHOLDER_NICKS: Record<CameraId, string> = {
  1: 'e.g. Left Wrist',
  2: 'e.g. Right Wrist',
  3: 'e.g. Helmet',
};

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
    let tmp: BleGoProClient | null = null;
    try {
      tmp = new BleGoProClient([]);
      const found = await tmp.scan(8000);
      setResults(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      tmp?.destroy();
      setScanning(false);
    }
  }, [bleAvailable]);

  const assign = useCallback(
    async (item: ScanItem) => {
      if (!settings || assignTarget === null) return;
      const existing = settings.pairedBleDevices.find((d) => d.cameraId === assignTarget);
      const next: BridgeSettings = {
        ...settings,
        pairedBleDevices: [
          ...settings.pairedBleDevices.filter((d) => d.cameraId !== assignTarget && d.bleId !== item.bleId),
          {
            cameraId: assignTarget,
            bleId: item.bleId,
            name: item.name,
            nickname: existing?.nickname,
            pairedAt: new Date().toISOString(),
          },
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

  const setNickname = useCallback(
    async (cameraId: CameraId, nickname: string) => {
      if (!settings) return;
      const trimmed = nickname.slice(0, 32);
      const next: BridgeSettings = {
        ...settings,
        pairedBleDevices: settings.pairedBleDevices.map((d) =>
          d.cameraId === cameraId ? { ...d, nickname: trimmed } : d,
        ),
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
            (built from this repo via EAS). The web version on Vercel cannot use
            Bluetooth — Safari and most mobile browsers do not implement Web Bluetooth.
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Camera slots */}
        <Section title="Slots">
          {CAMERA_IDS.map((id, idx) => {
            const p = paired.find((d) => d.cameraId === id);
            return (
              <SlotRow
                key={id}
                isLast={idx === CAMERA_IDS.length - 1}
                cameraId={id}
                paired={p}
                isAssigning={assignTarget === id}
                onAssign={() => setAssignTarget((t) => (t === id ? null : id))}
                onUnpair={() => unpair(id)}
                onNicknameChange={(n) => setNickname(id, n)}
              />
            );
          })}
        </Section>

        {/* Scan */}
        <Section title="Discovered Cameras">
          <Pressable
            onPress={startScan}
            disabled={scanning}
            style={({ pressed }) => [styles.scanBtn, { opacity: scanning ? 0.7 : pressed ? 0.85 : 1 }]}
          >
            {scanning ? <ActivityIndicator color="#fff" /> : <RefreshCw size={16} color="#fff" />}
            <Text style={styles.scanLabel}>{scanning ? 'Scanning for 8 seconds…' : 'Scan for GoPros'}</Text>
          </Pressable>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {assignTarget !== null && (
            <View style={styles.assignBanner}>
              <Text style={styles.assignBannerText}>
                Tap a discovered camera to assign it to slot {assignTarget}.
              </Text>
              <Pressable onPress={() => setAssignTarget(null)} hitSlop={8}>
                <X size={14} color="#9ca3af" />
              </Pressable>
            </View>
          )}

          {results.length === 0 && !scanning && !error ? (
            <Text style={styles.hint}>
              On each GoPro: Preferences → Connections → Connect Device → GoPro Quik App.
              Then tap Scan.
            </Text>
          ) : null}

          {results.map((item) => {
            const alreadyPaired = paired.find((d) => d.bleId === item.bleId);
            return (
              <ScanResultRow
                key={item.bleId}
                item={item}
                alreadyPairedTo={alreadyPaired?.cameraId ?? null}
                canAssign={assignTarget !== null}
                onPress={() => assign(item)}
              />
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

interface SlotRowProps {
  cameraId: CameraId;
  paired?: PairedBleDevice;
  isAssigning: boolean;
  isLast: boolean;
  onAssign: () => void;
  onUnpair: () => void;
  onNicknameChange: (n: string) => void;
}

function SlotRow({ cameraId, paired, isAssigning, isLast, onAssign, onUnpair, onNicknameChange }: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(paired?.nickname ?? '');

  useEffect(() => { setDraft(paired?.nickname ?? ''); }, [paired?.nickname]);

  const commit = () => {
    onNicknameChange(draft);
    setEditing(false);
  };

  return (
    <View style={[styles.slot, isLast && styles.slotLast]}>
      <View style={styles.slotMain}>
        <View style={styles.slotIndex}>
          <Text style={styles.slotIndexText}>{cameraId}</Text>
        </View>
        <View style={styles.slotBody}>
          {editing ? (
            <View style={styles.slotEditRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onBlur={commit}
                onSubmitEditing={commit}
                placeholder={PLACEHOLDER_NICKS[cameraId]}
                placeholderTextColor="#4b5563"
                autoFocus
                maxLength={32}
                style={styles.nickInput}
              />
              <Pressable onPress={commit} style={styles.nickSave}>
                <Check size={14} color="#10b981" />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => paired && setEditing(true)} disabled={!paired}>
              <View style={styles.slotTitleRow}>
                <Text style={styles.slotTitle}>
                  {paired?.nickname?.trim() || `GoPro ${cameraId}`}
                </Text>
                {paired ? <Pencil size={11} color="#6b7280" /> : null}
              </View>
            </Pressable>
          )}
          {paired ? (
            <>
              <Text style={styles.slotSub} numberOfLines={1}>
                {paired.name}
              </Text>
              <Text style={styles.slotMeta} numberOfLines={1}>
                {paired.bleId}
              </Text>
            </>
          ) : (
            <Text style={styles.slotEmpty}>Not paired</Text>
          )}
        </View>
        <View style={styles.slotActions}>
          {paired ? (
            <Pressable onPress={onUnpair} style={styles.unpairBtn} hitSlop={6}>
              <X size={14} color="#ef4444" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onAssign}
            style={[styles.assignBtn, isAssigning && styles.assignBtnActive]}
          >
            <Text style={[styles.assignLabel, isAssigning && styles.assignLabelActive]}>
              {isAssigning ? 'Pick…' : paired ? 'Replace' : 'Assign'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface ScanResultRowProps {
  item: ScanItem;
  alreadyPairedTo: CameraId | null;
  canAssign: boolean;
  onPress: () => void;
}

function ScanResultRow({ item, alreadyPairedTo, canAssign, onPress }: ScanResultRowProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!canAssign) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [canAssign, pulse]);

  const bg = canAssign ? pulse.interpolate({ inputRange: [0, 1], outputRange: ['#1f2937', '#1d3a6a'] }) : '#1f2937';

  return (
    <Pressable onPress={onPress} disabled={!canAssign}>
      <Animated.View style={[styles.resultRow, { backgroundColor: bg as any, opacity: canAssign ? 1 : 0.55 }]}>
        <Bluetooth size={16} color={canAssign ? '#60a5fa' : '#6b7280'} />
        <View style={styles.resultText}>
          <Text style={styles.resultName}>{item.name}</Text>
          <Text style={styles.resultId}>{item.bleId}</Text>
        </View>
        {alreadyPairedTo !== null ? (
          <View style={styles.resultPaired}>
            <Check size={12} color="#10b981" />
            <Text style={styles.resultPairedLabel}>Cam {alreadyPairedTo}</Text>
          </View>
        ) : item.rssi !== null ? (
          <Text style={styles.rssi}>{item.rssi} dBm</Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
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
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  slotLast: { borderBottomWidth: 0 },
  slotMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotIndexText: { color: '#93c5fd', fontWeight: '700', fontSize: 13 },
  slotBody: { flex: 1 },
  slotTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotTitle: { fontSize: 15, fontWeight: '700', color: '#f3f4f6' },
  slotSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  slotMeta: { fontSize: 10, color: '#6b7280', marginTop: 1, fontFamily: 'monospace' },
  slotEmpty: { fontSize: 12, color: '#6b7280', marginTop: 2, fontStyle: 'italic' },

  slotEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nickInput: {
    flex: 1,
    fontSize: 14,
    color: '#f3f4f6',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3b82f6',
  },
  nickSave: { padding: 4 },

  slotActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444444',
  },

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

  errorBox: {
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ef444415',
    borderWidth: 1,
    borderColor: '#ef444433',
  },
  errorText: { fontSize: 12, color: '#f87171' },

  assignBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1d3a6a40',
    borderWidth: 1,
    borderColor: '#3b82f655',
  },
  assignBannerText: { fontSize: 12, color: '#93c5fd', flex: 1 },

  hint: { fontSize: 12, color: '#9ca3af', paddingHorizontal: 14, paddingBottom: 14, lineHeight: 18 },

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
