import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/theme';

export function ProBadge() {
  return (
    <View style={s.proBadge}>
      <Text style={s.proBadgeText}>PRO</Text>
    </View>
  );
}

const s = StyleSheet.create({
  proBadge: { backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  proBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: '600', letterSpacing: 0.5 },
});
