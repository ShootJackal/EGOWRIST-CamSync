import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Bluetooth, ChevronRight } from 'lucide-react-native';

interface Props {
  onPair: () => void;
}

export function EmptyPairCTA({ onPair }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Bluetooth size={26} color="#60a5fa" />
      </View>
      <Text style={styles.title}>No cameras paired yet</Text>
      <Text style={styles.body}>
        Pair each GoPro to a slot. The phone will connect to all of them at once when you tap
        Connect All on the dashboard.
      </Text>
      <Pressable
        onPress={onPair}
        style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.btnLabel}>Pair Cameras</Text>
        <ChevronRight size={16} color="#fff" />
      </Pressable>
      <Text style={styles.hint}>
        On each GoPro: Preferences → Connections → Connect Device → GoPro Quik App.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1d3a6a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#f9fafb' },
  body: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 19,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  btnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 16, marginTop: 4 },
});
