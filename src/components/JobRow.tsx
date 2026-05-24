import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/theme';
import { Job } from '@/store';
import { formatCurrency } from '@/utils/format';

export function JobRow({ job }: { job: Job }) {
  const tagColors: Record<string, { bg: string; text: string }> = {
    active:   { bg: Colors.accentDim, text: Colors.accent },
    pending:  { bg: Colors.goldDim,   text: Colors.gold },
    review:   { bg: Colors.blueDim,   text: Colors.blue },
    complete: { bg: Colors.surface2,  text: Colors.textMuted },
  };
  const tag = tagColors[job.status] || tagColors.complete;
  return (
    <View style={s.jobRow}>
      <View style={s.jobMeta}>
        <Text style={s.jobName} numberOfLines={1}>{job.name}</Text>
        <Text style={s.jobSub}>{job.phase} · {formatCurrency(job.value, true)}</Text>
      </View>
      <View style={[s.jobTag, { backgroundColor: tag.bg }]}>
        <Text style={[s.jobTagText, { color: tag.text }]}>{job.status}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  jobMeta: { flex: 1 },
  jobName: { fontSize: 13, fontWeight: '500', color: Colors.text },
  jobSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  jobTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  jobTagText: { fontSize: 10, fontWeight: '500' },
});
