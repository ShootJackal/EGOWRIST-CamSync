import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Timer, Zap } from 'lucide-react-native';
import { RecordingSession } from '@/lib/capture/types';
import { formatDuration } from '@/lib/capture/formatting';

interface Props {
  session: RecordingSession | null;
}

export function RecordingSessionBanner({ session }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!session || session.stoppedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Date.now() - new Date(session.startedAt).getTime());
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [session?.id, session?.stoppedAt]);

  if (!session) return null;

  const isActive = !session.stoppedAt;

  return (
    <View style={[styles.banner, isActive ? styles.active : styles.stopped]}>
      <View style={styles.row}>
        <Timer size={15} color={isActive ? '#ef4444' : '#9ca3af'} />
        <Text style={[styles.label, { color: isActive ? '#fca5a5' : '#9ca3af' }]}>
          {isActive ? 'Recording' : 'Session ended'}
        </Text>
        <Text style={[styles.timer, { color: isActive ? '#ffffff' : '#6b7280' }]}>
          {isActive ? formatDuration(elapsed) : formatDuration(session.durationMs ?? 0)}
        </Text>
      </View>
      {session.commandSpreadMs !== null && (
        <View style={styles.row}>
          <Zap size={11} color="#f59e0b" />
          <Text style={styles.spread}>
            {session.commandSpreadMs}ms command spread across cameras
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 4,
    borderWidth: 1,
  },
  active: {
    backgroundColor: '#ef444415',
    borderColor: '#ef444440',
  },
  stopped: {
    backgroundColor: '#1f293750',
    borderColor: '#37415170',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  timer: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  spread: {
    fontSize: 11,
    color: '#9ca3af',
  },
});
