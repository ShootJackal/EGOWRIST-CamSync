import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Modal,
} from 'react-native';
import { X, CheckCircle, XCircle } from 'lucide-react-native';
import { CommandLogEntry, CameraId } from '@/lib/capture/types';
import { formatTimestamp, formatLatency } from '@/lib/capture/formatting';

interface Props {
  visible: boolean;
  onClose: () => void;
  logs: CommandLogEntry[];
}

type CameraFilter = 'all' | CameraId;
type StatusFilter = 'all' | 'success' | 'failure';

export function CommandLogSheet({ visible, onClose, logs }: Props) {
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = logs.filter((l) => {
    const camMatch = cameraFilter === 'all' || l.cameraId === cameraFilter;
    const statMatch =
      statusFilter === 'all' ||
      (statusFilter === 'success' && l.success) ||
      (statusFilter === 'failure' && !l.success);
    return camMatch && statMatch;
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Command Log</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#9ca3af" />
            </Pressable>
          </View>

          {/* Camera filter */}
          <View style={styles.filterRow}>
            {(['all', 1, 2, 3] as CameraFilter[]).map((f) => (
              <Pressable
                key={String(f)}
                onPress={() => setCameraFilter(f)}
                style={[styles.chip, cameraFilter === f && styles.chipActive]}
              >
                <Text style={[styles.chipText, cameraFilter === f && styles.chipTextActive]}>
                  {f === 'all' ? 'All Cams' : `Cam ${f}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Status filter */}
          <View style={styles.filterRow}>
            {(['all', 'success', 'failure'] as StatusFilter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setStatusFilter(f)}
                style={[styles.chip, statusFilter === f && styles.chipActive]}
              >
                <Text style={[styles.chipText, statusFilter === f && styles.chipTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Log list */}
          <FlatList
            data={[...filtered].reverse()}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.empty}>No log entries match your filters</Text>
            }
            renderItem={({ item }) => <LogRow entry={item} />}
          />
        </View>
      </View>
    </Modal>
  );
}

function LogRow({ entry }: { entry: CommandLogEntry }) {
  return (
    <View style={[styles.row, !entry.success && styles.rowError]}>
      <View style={styles.rowLeft}>
        {entry.success ? (
          <CheckCircle size={14} color="#10b981" />
        ) : (
          <XCircle size={14} color="#ef4444" />
        )}
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.command}>{entry.command}</Text>
            <Text style={styles.camId}>
              {entry.cameraId === 'all' ? 'All' : `Cam ${entry.cameraId}`}
            </Text>
          </View>
          {entry.errorMessage && (
            <Text style={styles.errorMsg} numberOfLines={2}>{entry.errorMessage}</Text>
          )}
          <Text style={styles.meta}>
            {formatTimestamp(entry.issuedAt)} · {formatLatency(entry.latencyMs)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
  },
  closeBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1f2937',
  },
  chipActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#1d3a6a',
  },
  chipText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#93c5fd',
    fontWeight: '600',
  },
  list: {
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  empty: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
  },
  row: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  rowError: {
    borderColor: '#ef444430',
    backgroundColor: '#ef444408',
  },
  rowLeft: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  command: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f3f4f6',
  },
  camId: {
    fontSize: 11,
    color: '#9ca3af',
    backgroundColor: '#374151',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  errorMsg: {
    fontSize: 11,
    color: '#f87171',
  },
  meta: {
    fontSize: 11,
    color: '#6b7280',
  },
});
