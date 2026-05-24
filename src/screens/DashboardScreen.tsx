import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState, setContracts, setJobs } from '@/store';
import { SamGovService } from '@/services/SamGovService';
import { StatCard } from '@/components/StatCard';
import { ContractRow } from '@/components/ContractRow';
import { JobRow } from '@/components/JobRow';
import { ProBadge } from '@/components/ProBadge';
import { LockedFeature } from '@/components/LockedFeature';

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const { tier } = useSelector((s: RootState) => s.subscription);
  const contracts = useSelector((s: RootState) => s.contracts.items);
  const jobs = useSelector((s: RootState) => s.jobs.items);
  const [refreshing, setRefreshing] = useState(false);

  const isPro = tier === 'pro';

  const load = async () => {
    try {
      const data = await SamGovService.searchOpportunities({ naicsCodes: ['332312'], setAsideType: 'SDVOSB' });
      dispatch(setContracts(data));
      // In production, jobs come from your backend
      dispatch(setJobs([
        { id: '1', name: 'Minden Welding Shop Build-out', client: 'Private', value: 48000, status: 'active', phase: 'Phase 2 of 3', startDate: '2024-04-01', estimatedEnd: '2024-05-28', invoiced: 28000, notes: '' },
        { id: '2', name: 'USDA Rural Dev Fence Install', client: 'USDA', value: 22000, status: 'pending', phase: 'Awaiting materials', startDate: '2024-05-01', estimatedEnd: '2024-06-15', invoiced: 0, notes: '' },
        { id: '3', name: 'Fort Johnson Gate Fabrication', client: 'Dept of Army', value: 31000, status: 'review', phase: 'Change order #2', startDate: '2024-03-15', estimatedEnd: '2024-05-30', invoiced: 15000, notes: '' },
      ]));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const activeJobs = jobs.filter(j => j.status === 'active').length;
  const pipelineValue = jobs.reduce((s, j) => s + j.value, 0);
  const openContracts = contracts.filter(c => c.status === 'open').length;
  const invoicedYTD = jobs.reduce((s, j) => s + j.invoiced, 0);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Good morning, {user?.name?.split(' ')[0]}</Text>
          <Text style={s.sub}>ForgeFront · SDVOSB Command Center</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Paywall')} style={s.tierBadge}>
          <Text style={s.tierText}>{tier.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {openContracts > 0 && (
        <TouchableOpacity style={s.alert} onPress={() => navigation.navigate('Contracts')}>
          <View style={s.alertDot} />
          <Text style={s.alertText}>{openContracts} new contract matches — tap to view</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.statRow}>
          <StatCard label="Active jobs" value={activeJobs} trend="+2 this week" positive />
          <StatCard label="Pipeline" value={`$${(pipelineValue / 1000).toFixed(0)}K`} trend="+12% MoM" positive />
          <StatCard label="Open opps" value={openContracts} trend="SAM.gov live" />
          <StatCard label="Invoiced YTD" value={`$${(invoicedYTD / 1000).toFixed(0)}K`} trend="+34% YoY" positive />
        </View>

        {/* Contract Feed */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>CONTRACT INTEL FEED</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Contracts')}>
              <Text style={s.sectionAction}>See all</Text>
            </TouchableOpacity>
          </View>
          {contracts.slice(0, 3).map(c => (
            <ContractRow key={c.id} contract={c} onPress={() => navigation.navigate('ContractDetail', { contractId: c.id })} />
          ))}
        </View>

        {/* Active Jobs */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>ACTIVE JOBS</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Jobs')}>
              <Text style={s.sectionAction}>Manage</Text>
            </TouchableOpacity>
          </View>
          {jobs.slice(0, 3).map(j => (
            <JobRow key={j.id} job={j} />
          ))}
        </View>

        {/* AI Bid Writer - Pro Locked */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>AI BID WRITER</Text>
            <ProBadge />
          </View>
          {isPro ? (
            <TouchableOpacity style={s.bidCta} onPress={() => navigation.navigate('BidWriter')}>
              <Ionicons name="create-outline" size={20} color={Colors.accent} />
              <Text style={s.bidCtaText}>Generate proposal from contract</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
            </TouchableOpacity>
          ) : (
            <LockedFeature
              title="Auto-generate bid proposals"
              desc="Select any contract and AI writes a compliant SDVOSB proposal in 60 seconds."
              onUnlock={() => navigation.navigate('Paywall')}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  greeting: { ...Typography.h3, marginBottom: 2 },
  sub: { ...Typography.bodySmall, color: Colors.textMuted },
  tierBadge: { backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  tierText: { ...Typography.label, color: Colors.gold },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder, borderRadius: Radius.md, padding: Spacing.md },
  alertDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent },
  alertText: { flex: 1, ...Typography.bodySmall, color: Colors.text },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  section: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { ...Typography.label },
  sectionAction: { fontSize: 12, color: Colors.accent },
  bidCta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder, borderRadius: Radius.md, padding: Spacing.md },
  bidCtaText: { flex: 1, ...Typography.body, color: Colors.accent },
});
