import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/theme';
import { Contract } from '@/store';
import { formatCurrency } from '@/utils/format';

export function ContractRow({ contract, onPress }: { contract: Contract; onPress?: () => void }) {
  const statusColors: Record<string, string> = {
    open: Colors.accent, bidding: Colors.blue, closed: Colors.textMuted, awarded: Colors.gold,
  };
  const daysLeft = Math.ceil((new Date(contract.dueDate).getTime() - Date.now()) / 86400000);
  return (
    <TouchableOpacity style={s.contractRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.contractDot, { backgroundColor: statusColors[contract.status] + '22' }]}>
        <Ionicons name="document-text-outline" size={16} color={statusColors[contract.status]} />
      </View>
      <View style={s.contractMeta}>
        <Text style={s.contractName} numberOfLines={1}>{contract.title}</Text>
        <Text style={s.contractAgency} numberOfLines={1}>{contract.agency}</Text>
      </View>
      <View style={s.contractRight}>
        <Text style={s.contractVal}>{formatCurrency(contract.value, true)}</Text>
        <Text style={[s.contractStatus, { color: statusColors[contract.status] }]}>
          {contract.status === 'open' && daysLeft > 0 ? `${daysLeft}d left` : contract.status}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  contractRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  contractDot: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  contractMeta: { flex: 1, minWidth: 0 },
  contractName: { fontSize: 13, fontWeight: '500', color: Colors.text },
  contractAgency: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  contractRight: { alignItems: 'flex-end', flexShrink: 0 },
  contractVal: { fontSize: 13, fontWeight: '600', color: Colors.text, fontFamily: 'monospace' },
  contractStatus: { fontSize: 10, marginTop: 2 },
});
