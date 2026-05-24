import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/theme';

export function StatCard({ label, value, trend, positive }: {
  label: string; value: string | number; trend?: string; positive?: boolean;
}) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statVal}>{value}</Text>
      {trend && <Text style={[s.statTrend, positive && s.positive]}>{trend}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  statCard: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10 },
  statLabel: { fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  statVal: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  statTrend: { fontSize: 10, color: Colors.textMuted },
  positive: { color: Colors.accent },
});
