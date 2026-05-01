import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2, AlertTriangle, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react-native';
import { PreflightReport } from '@/lib/capture/preflight';

interface Props {
  report: PreflightReport;
}

export function PreflightBanner({ report }: Props) {
  const [expanded, setExpanded] = useState(false);

  const blockers = report.issues.filter((i) => i.severity === 'blocker');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const hasAny = blockers.length + warnings.length > 0;

  const tone = blockers.length > 0 ? 'blocker' : warnings.length > 0 ? 'warning' : 'ok';
  const cfg = TONES[tone];

  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Pressable
        onPress={() => hasAny && setExpanded((e) => !e)}
        style={styles.row}
        disabled={!hasAny}
      >
        {cfg.icon}
        <Text style={[styles.label, { color: cfg.text }]} numberOfLines={2}>
          {report.summary}
        </Text>
        {hasAny ? (
          expanded ? <ChevronUp size={16} color={cfg.text} /> : <ChevronDown size={16} color={cfg.text} />
        ) : null}
      </Pressable>

      {expanded && hasAny ? (
        <View style={styles.list}>
          {[...blockers, ...warnings].map((i, idx) => (
            <View key={`${i.cameraId}-${idx}`} style={styles.issue}>
              <View
                style={[
                  styles.issueDot,
                  { backgroundColor: i.severity === 'blocker' ? '#ef4444' : '#f59e0b' },
                ]}
              />
              <Text style={styles.issueText}>{i.message}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const TONES: Record<
  'ok' | 'warning' | 'blocker',
  { bg: string; border: string; text: string; icon: React.ReactNode }
> = {
  ok: {
    bg: '#065f4615',
    border: '#10b98133',
    text: '#34d399',
    icon: <CheckCircle2 size={16} color="#34d399" />,
  },
  warning: {
    bg: '#451a0320',
    border: '#f59e0b44',
    text: '#fbbf24',
    icon: <AlertTriangle size={16} color="#fbbf24" />,
  },
  blocker: {
    bg: '#7f1d1d20',
    border: '#ef444444',
    text: '#fca5a5',
    icon: <ShieldAlert size={16} color="#fca5a5" />,
  },
};

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  list: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ffffff15',
    gap: 6,
  },
  issue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  issueDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  issueText: { flex: 1, fontSize: 12, color: '#d1d5db', lineHeight: 17 },
});
