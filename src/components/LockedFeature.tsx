import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/theme';

export function LockedFeature({ title, desc, onUnlock }: {
  title: string; desc: string; onUnlock: () => void;
}) {
  return (
    <TouchableOpacity style={s.locked} onPress={onUnlock} activeOpacity={0.8}>
      <Ionicons name="lock-closed-outline" size={24} color={Colors.gold} style={{ marginBottom: 8 }} />
      <Text style={s.lockedTitle}>{title}</Text>
      <Text style={s.lockedDesc}>{desc}</Text>
      <View style={s.unlockBtn}>
        <Text style={s.unlockText}>Upgrade to Pro — $79/mo</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  locked: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  lockedTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6, textAlign: 'center' },
  lockedDesc: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  unlockBtn: { backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder, borderRadius: Radius.md, paddingHorizontal: 18, paddingVertical: 9 },
  unlockText: { fontSize: 13, color: Colors.gold, fontWeight: '500' },
});
