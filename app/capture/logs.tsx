import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  FlatList,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { CheckCircle, XCircle, Clock } from 'lucide-react-native';
import { CommandLogEntry, RecordingSession, CameraId } from '@/lib/capture/types';
import * as Api from '@/lib/capture/api';
import { formatTimestamp, formatLatency, formatDuration } from '@/lib/capture/formatting';

type CameraFilter = 'all' | CameraId;
type StatusFilter = 'all' | 'success' | 'failure';

// This screen shows session history + a global command log pulled from the bridge
export default function LogsScreen() {
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<'sessions' | 'commands'>('sessions');

  useEffect(() => {
    Api.getSessions().then(setSessions).catch(() => {});
    const interval = setInterval(() => {
      Api.getSessions().then(setSessions).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Logs</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('sessions')}
          style={[styles.tab, tab === 'sessions' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'sessions' && styles.tabTextActive]}>Sessions</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('commands')}
          style={[styles.tab, tab === 'commands' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'commands' && styles.tabTextActive]}>Commands</Text>
        </Pressable>
      </View>

      {tab === 'sessions' ? (
        <FlatList
          data={[...sessions].reverse()}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Clock size={40} color="#374151" />
              <Text style={styles.emptyText}>No sessions recorded yet</Text>
              <Text style={styles.emptySub}>Start recording from the Capture tab</Text>
            </View>
          }
          renderItem={({ item: session }) => <SessionRow session={session} />}
        />
      ) : (
        <View style={styles.commandsPlaceholder}>
          <Text style={styles.commandsNote}>
            Open the command log from the Capture tab using the log icon, or use the bridge's JSONL log files for full command history.
          </Text>
          <View style={styles.filterRow}>
            {(['all', 1, 2, 3] as CameraFilter[]).map((f) => (
              <Pressable
                key={String(f)}
                onPress={() => setCameraFilter(f)}
                style={[styles.chip, cameraFilter === f && styles.chipActive]}
              >
                <Text style={[styles.chipText, cameraFilter === f && styles.chipTextActive]}>
                  {f === 'all' ? 'All' : `Cam ${f}`}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.commandsNote}>
            Real-time command log is available in the Capture dashboard.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function SessionRow({ session }: { session: RecordingSession }) {
  const isActive = !session.stoppedAt;
  const started = new Date(session.startedAt);
  const duration = session.durationMs ? formatDuration(session.durationMs) : '—';

  return (
    <View style={[styles.sessionCard, isActive && styles.sessionCardActive]}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionLeft}>
          {isActive ? (
            <View style={styles.recDot} />
          ) : (
            <CheckCircle size={14} color="#10b981" />
          )}
          <Text style={styles.sessionId} numberOfLines={1}>
            Session {session.id.slice(-6).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.sessionStatus, { color: isActive ? '#ef4444' : '#6b7280' }]}>
          {isActive ? 'LIVE' : 'Ended'}
        </Text>
      </View>
      <View style={styles.sessionMeta}>
        <MetaItem label="Started" value={formatTimestamp(session.startedAt)} />
        <MetaItem label="Duration" value={duration} />
        {session.commandSpreadMs !== null && (
          <MetaItem label="Spread" value={`${session.commandSpreadMs}ms`} />
        )}
        <MetaItem label="Cameras" value={session.cameraIds.map((id) => `Cam ${id}`).join(', ')} />
      </View>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#f9fafb', letterSpacing: -0.5 },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1f2937',
  },
  tabActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#1d3a6a',
  },
  tabText: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  tabTextActive: { color: '#93c5fd', fontWeight: '600' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: '#6b7280', fontWeight: '500' },
  emptySub: { fontSize: 13, color: '#4b5563' },
  sessionCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 12,
  },
  sessionCardActive: {
    borderColor: '#ef444440',
    backgroundColor: '#ef444408',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  sessionId: { fontSize: 14, fontWeight: '600', color: '#f3f4f6', flex: 1 },
  sessionStatus: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  sessionMeta: { gap: 6 },
  metaItem: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 12, color: '#9ca3af' },
  metaValue: { fontSize: 12, color: '#d1d5db', fontWeight: '500' },
  commandsPlaceholder: { paddingHorizontal: 20, gap: 16 },
  commandsNote: { fontSize: 13, color: '#9ca3af', lineHeight: 20 },
  filterRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1f2937',
  },
  chipActive: { borderColor: '#60a5fa', backgroundColor: '#1d3a6a' },
  chipText: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  chipTextActive: { color: '#93c5fd', fontWeight: '600' },
});
