import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
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
        {isActive ? <PulsingDot /> : <Timer size={15} color="#9ca3af" />}
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

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.5, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <Animated.View style={[styles.pulseDot, { transform: [{ scale }], opacity }]} />
  );
}

const styles = StyleSheet.create({
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
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
