import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Camera } from 'lucide-react-native';

interface Props {
  cameraId: number;
  previewUrl?: string | null;
  isRecording?: boolean;
}

export function PreviewPanel({ cameraId, previewUrl, isRecording }: Props) {
  // Preview stream is a future feature — GoPro preview streams require
  // USB or direct Wi-Fi; they cannot be proxied easily through the bridge.
  // This placeholder renders correctly and can be wired up later.
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Camera size={32} color="#374151" />
        <Text style={styles.label}>Live Preview</Text>
        <Text style={styles.sub}>Available via direct Wi-Fi connection</Text>
        {isRecording && <View style={styles.recDot} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f1117',
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  sub: {
    fontSize: 11,
    color: '#1f2937',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  recDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
});
