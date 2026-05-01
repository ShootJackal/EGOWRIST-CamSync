import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CheckCircle, XCircle, FlaskConical, Wifi, Globe, HelpCircle } from 'lucide-react-native';
import { BridgeSettings, ConnectionMode, DEFAULT_BRIDGE_SETTINGS } from '@/lib/capture/types';
import { loadBridgeSettings, saveBridgeSettings, clearBridgeSettings } from '@/lib/capture/storage';
import * as Api from '@/lib/capture/api';

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<BridgeSettings>(DEFAULT_BRIDGE_SETTINGS);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadBridgeSettings().then(setSettings);
  }, []);

  const update = (partial: Partial<BridgeSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveBridgeSettings(settings);
    Api.initApi(settings);
    setSaved(true);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const tmpSettings = { ...settings };
      Api.initApi(tmpSettings);
      await Api.checkHealth();
      setTestStatus('ok');
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleReset = () => {
    clearBridgeSettings();
    setSettings(DEFAULT_BRIDGE_SETTINGS);
    Api.initApi(DEFAULT_BRIDGE_SETTINGS);
    setSaved(false);
  };

  const isMock = settings.connectionMode === 'mock';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        {/* Connection mode */}
        <Section title="Connection Mode">
          <ModeButton
            active={settings.connectionMode === 'mock'}
            label="Mock"
            sub="Simulated cameras — no bridge required"
            icon={<FlaskConical size={18} color={settings.connectionMode === 'mock' ? '#60a5fa' : '#6b7280'} />}
            onPress={() => update({ connectionMode: 'mock' })}
          />
          <ModeButton
            active={settings.connectionMode === 'local'}
            label="Local LAN"
            sub="Bridge running on Mac, same Wi-Fi network"
            icon={<Wifi size={18} color={settings.connectionMode === 'local' ? '#60a5fa' : '#6b7280'} />}
            onPress={() => update({ connectionMode: 'local' })}
          />
          <ModeButton
            active={settings.connectionMode === 'tunnel'}
            label="Tunnel"
            sub="Cloudflare or ngrok HTTPS tunnel URL"
            icon={<Globe size={18} color={settings.connectionMode === 'tunnel' ? '#60a5fa' : '#6b7280'} />}
            onPress={() => update({ connectionMode: 'tunnel' })}
          />
        </Section>

        {/* Bridge URL */}
        {!isMock && (
          <Section title="Bridge URL">
            <TextInput
              style={styles.input}
              value={settings.bridgeUrl}
              onChangeText={(v) => update({ bridgeUrl: v.trim() })}
              placeholder={
                settings.connectionMode === 'local'
                  ? 'http://192.168.1.50:4000'
                  : 'https://your-tunnel.trycloudflare.com'
              }
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.inputHint}>
              {settings.connectionMode === 'local'
                ? 'Use your Mac LAN IP. Run: ifconfig | grep inet on your Mac.'
                : 'Run: cloudflared tunnel --url http://localhost:4000'}
            </Text>
          </Section>
        )}

        {/* Auth token */}
        {!isMock && (
          <Section title="Auth Token (optional)">
            <TextInput
              style={styles.input}
              value={settings.authToken}
              onChangeText={(v) => update({ authToken: v.trim() })}
              placeholder="Leave blank if bridge has no auth"
              placeholderTextColor="#4b5563"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>
              Set BRIDGE_AUTH_TOKEN in your bridge .env to require this.
            </Text>
          </Section>
        )}

        {/* Test connection */}
        {!isMock && (
          <Section title="Connection Test">
            <Pressable
              onPress={handleTest}
              disabled={testStatus === 'testing' || !settings.bridgeUrl}
              style={({ pressed }) => [
                styles.testBtn,
                { opacity: testStatus === 'testing' || !settings.bridgeUrl ? 0.5 : pressed ? 0.8 : 1 },
              ]}
            >
              {testStatus === 'testing' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : testStatus === 'ok' ? (
                <CheckCircle size={16} color="#10b981" />
              ) : testStatus === 'error' ? (
                <XCircle size={16} color="#ef4444" />
              ) : (
                <Wifi size={16} color="#fff" />
              )}
              <Text style={styles.testBtnLabel}>
                {testStatus === 'testing'
                  ? 'Testing…'
                  : testStatus === 'ok'
                  ? 'Connected!'
                  : testStatus === 'error'
                  ? 'Failed'
                  : 'Test Connection'}
              </Text>
            </Pressable>
            {testStatus === 'error' && testError && (
              <Text style={styles.testError}>{testError}</Text>
            )}
          </Section>
        )}

        {/* Save */}
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.saveBtnLabel}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
        </Pressable>

        {/* Mac setup instructions */}
        <Section title="Local Bridge Setup">
          <View style={styles.instructions}>
            <Text style={styles.instructionsText}>
              {'1. Clone the repo and install bridge dependencies:\n\n'}
              <Text style={styles.code}>cd server/bridge{'\n'}npm install</Text>
              {'\n\n2. Copy and configure the bridge .env:\n\n'}
              <Text style={styles.code}>cp .env.example .env{'\n'}# Edit CAMERA_MODE=mock (default){'\n'}# Or set CAMERA_MODE=real for GoPros</Text>
              {'\n\n3. Run the bridge:\n\n'}
              <Text style={styles.code}>npm run dev</Text>
              {'\n\n4. Find your Mac LAN IP:\n\n'}
              <Text style={styles.code}>ifconfig | grep "inet " | grep -v 127</Text>
              {'\n\n5. Enter the bridge URL above:\n\n'}
              <Text style={styles.code}>http://{'<'}MAC_IP{'>'}:4000</Text>
            </Text>
          </View>
        </Section>

        {/* Tunnel instructions */}
        <Section title="Tunnel Setup (for HTTPS)">
          <View style={styles.instructions}>
            <Text style={styles.instructionsText}>
              {'Cloudflare Tunnel (recommended):\n\n'}
              <Text style={styles.code}>{'brew install cloudflare/cloudflare/cloudflared\ncloudflared tunnel --url http://localhost:4000'}</Text>
              {'\n\nCopy the https://….trycloudflare.com URL and paste it in Bridge URL above, then set mode to Tunnel.'}
            </Text>
          </View>
        </Section>

        {/* Reset */}
        <Pressable onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetBtnLabel}>Reset to Defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

interface ModeBtnProps {
  active: boolean;
  label: string;
  sub: string;
  icon: React.ReactNode;
  onPress: () => void;
}

function ModeButton({ active, label, sub, icon, onPress }: ModeBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeBtn, active && styles.modeBtnActive]}
    >
      {icon}
      <View style={styles.modeBtnText}>
        <Text style={[styles.modeBtnLabel, { color: active ? '#93c5fd' : '#d1d5db' }]}>{label}</Text>
        <Text style={styles.modeBtnSub}>{sub}</Text>
      </View>
      {active && <View style={styles.activeCheck} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  content: { padding: 20, paddingBottom: 60, gap: 20 },
  title: { fontSize: 28, fontWeight: '700', color: '#f9fafb', letterSpacing: -0.5, marginBottom: 4 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionContent: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#374151',
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  modeBtnActive: { backgroundColor: '#1d3a6a30' },
  modeBtnText: { flex: 1 },
  modeBtnLabel: { fontSize: 14, fontWeight: '600' },
  modeBtnSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  activeCheck: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#60a5fa',
  },
  input: {
    padding: 14,
    fontSize: 14,
    color: '#f3f4f6',
    fontFamily: 'monospace',
  },
  inputHint: {
    fontSize: 11,
    color: '#6b7280',
    paddingHorizontal: 14,
    paddingBottom: 12,
    lineHeight: 16,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1e3a5f',
    justifyContent: 'center',
  },
  testBtnLabel: { fontSize: 14, fontWeight: '600', color: '#93c5fd' },
  testError: { fontSize: 12, color: '#f87171', padding: 14, paddingTop: 0 },
  saveBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  instructions: { padding: 16 },
  instructionsText: { fontSize: 13, color: '#9ca3af', lineHeight: 22 },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#a5b4fc',
    backgroundColor: '#1e1b4b',
  },
  resetBtn: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  resetBtnLabel: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
});
