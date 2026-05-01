import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BatteryFull, BatteryMedium, BatteryLow, BatteryWarning } from 'lucide-react-native';

interface Props {
  percent: number | null;
  size?: 'sm' | 'md';
}

function batteryColor(p: number): string {
  if (p > 50) return '#10b981';
  if (p > 20) return '#f59e0b';
  return '#ef4444';
}

function BatteryIcon({ percent, size }: { percent: number; size: number }) {
  const color = batteryColor(percent);
  if (percent > 75) return <BatteryFull size={size} color={color} />;
  if (percent > 40) return <BatteryMedium size={size} color={color} />;
  if (percent > 15) return <BatteryLow size={size} color={color} />;
  return <BatteryWarning size={size} color={color} />;
}

export function BatteryPill({ percent, size = 'md' }: Props) {
  if (percent === null) {
    return (
      <View style={styles.pill}>
        <Text style={[styles.text, { color: '#6b7280', fontSize: size === 'sm' ? 11 : 13 }]}>—%</Text>
      </View>
    );
  }

  const iconSize = size === 'sm' ? 13 : 16;
  const fontSize = size === 'sm' ? 11 : 13;
  const color = batteryColor(percent);

  return (
    <View style={[styles.pill, { borderColor: color + '44', backgroundColor: color + '15' }]}>
      <BatteryIcon percent={percent} size={iconSize} />
      <Text style={[styles.text, { color, fontSize, marginLeft: 3 }]}>{Math.round(percent)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1f293740',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    fontWeight: '600',
  },
});
