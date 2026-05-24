import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState, Contract, setContracts } from '@/store';
import { SamGovService } from '@/services/SamGovService';
import { ContractRow } from '@/components/ContractRow';
import { formatCurrency, formatRelativeDate } from '@/utils/format';

const SET_ASIDE_OPTIONS = ['All', 'SDVOSB', 'VOSB', 'Small Business', '8(a)', 'Unrestricted'];

export function ContractsScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const contracts = useSelector((s: RootState) => s.contracts.items);
  const { tier } = useSelector((s: RootState) => s.subscription);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [setAside, setSetAside] = useState('SDVOSB');

  const isPro = tier === 'pro';

  const load = async (sa = setAside) => {
    setLoading(true);
    try {
      const data = await SamGovService.searchOpportunities({
        naicsCodes: ['332312', '238190', '236220'],
        setAsideType: sa === 'All' ? '' : sa,
      });
      dispatch(setContracts(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = contracts.filter(c => {
    const q = search.toLowerCase();
    return !q || c.title.toLowerCase().includes(q) || c.agency.toLowerCase().includes(q);
  });

  const totalValue = filtered.reduce((s, c) => s + c.value, 0);
  const openCount = filtered.filter(c => c.status === 'open').length;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Contract Intel</Text>
        <Text style={s.meta}>SAM.gov · Live</Text>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statPill}>
          <Text style={s.statVal}>{filtered.length}</Text>
          <Text style={s.statLabel}>Matches</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statVal}>{openCount}</Text>
          <Text style={s.statLabel}>Open</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statVal}>{formatCurrency(totalValue, true)}</Text>
          <Text style={s.statLabel}>Total value</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search contracts..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Set-aside filters */}
      <FlatList
        horizontal
        data={SET_ASIDE_OPTIONS}
        keyExtractor={i => i}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.filterChip, setAside === item && s.filterChipActive]}
            onPress={() => { setSetAside(item); load(item); }}
          >
            <Text style={[s.filterChipText, setAside === item && s.filterChipTextActive]}>{item}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={isPro ? filtered : filtered.slice(0, 3)}
          keyExtractor={c => c.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={!isPro ? (
            <TouchableOpacity style={s.upgradeBar} onPress={() => navigation.navigate('Paywall')}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.gold} />
              <Text style={s.upgradeText}>{filtered.length - 3} more contracts — upgrade to Pro to unlock</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
            </TouchableOpacity>
          ) : null}
          renderItem={({ item }) => (
            <ContractRow
              contract={item}
              onPress={() => navigation.navigate('ContractDetail', { contractId: item.id })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { ...Typography.h3 },
  meta: { fontSize: 11, color: Colors.accent, fontFamily: 'monospace' },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  statPill: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  statVal: { ...Typography.h4, color: Colors.text, marginBottom: 2 },
  statLabel: { ...Typography.label, fontSize: 10 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 40 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14 },
  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.accentDim, borderColor: Colors.accentBorder },
  filterChipText: { fontSize: 12, color: Colors.textMuted },
  filterChipTextActive: { color: Colors.accent },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  upgradeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
  upgradeText: { flex: 1, fontSize: 13, color: Colors.gold },
});
