import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState } from '@/store';
import { BidWriterService, BidWriterOutput } from '@/services/BidWriterService';

const SECTIONS = [
  { key: 'executiveSummary', label: 'Executive Summary', icon: 'document-outline' },
  { key: 'technicalApproach', label: 'Technical Approach', icon: 'construct-outline' },
  { key: 'pastPerformance', label: 'Past Performance', icon: 'trophy-outline' },
  { key: 'sdvosbStatement', label: 'SDVOSB Statement', icon: 'ribbon-outline' },
  { key: 'pricingNarrative', label: 'Pricing Narrative', icon: 'cash-outline' },
] as const;

export function BidWriterScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const contracts = useSelector((s: RootState) => s.contracts.items);
  const { user } = useSelector((s: RootState) => s.auth);
  const contract = contracts.find(c => c.id === route.params?.contractId) || contracts[0];

  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [output, setOutput] = useState<BidWriterOutput | null>(null);
  const [activeSection, setActiveSection] = useState<string>('executiveSummary');

  const generate = async () => {
    if (!contract) return;
    setGenerating(true);
    setStreamText('');
    setOutput(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await BidWriterService.generateBid(
        {
          contract,
          company: {
            name: user?.company || 'NextGen Welding & Fabrication LLC',
            uei: 'REPLACE_UEI',
            cage: 'REPLACE_CAGE',
            sdvosb: true,
            naicsCodes: ['332312'],
            pastPerformance: [
              'Fort Johnson gate fabrication — $31K, on-time delivery',
              'USDA Rural Development fencing — $22K, zero deficiencies',
              'VA NCO 16 maintenance IDIQ — $185K, current',
            ],
            capabilities: 'Structural steel fabrication, pre-engineered metal buildings, welding (AWS D1.1), fencing systems, OSHA-compliant field operations',
            yearsInBusiness: 3,
            state: 'Louisiana',
          },
          tone: 'confident',
        },
        (chunk) => setStreamText(prev => prev + chunk)
      );
      setOutput(result);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Generation failed', e.message);
    } finally {
      setGenerating(false);
    }
  };

  const share = async () => {
    if (!output) return;
    await Share.share({ message: output.fullProposal, title: `Bid Proposal — ${contract?.title}` });
  };

  const currentContent = output ? (output as any)[activeSection] : '';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-down" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>AI Bid Writer</Text>
        {output && (
          <TouchableOpacity onPress={share} style={s.shareBtn}>
            <Ionicons name="share-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      {contract && (
        <View style={s.contractCard}>
          <View style={s.contractBadge}><Text style={s.contractBadgeText}>SDVOSB SET-ASIDE</Text></View>
          <Text style={s.contractTitle} numberOfLines={2}>{contract.title}</Text>
          <Text style={s.contractMeta}>{contract.agency} · ${(contract.value / 1000).toFixed(0)}K</Text>
        </View>
      )}

      {!output && !generating && (
        <View style={s.center}>
          <Ionicons name="create-outline" size={48} color={Colors.textMuted} />
          <Text style={s.promptTitle}>Generate compliant proposal</Text>
          <Text style={s.promptSub}>AI writes your full bid package using your company profile, past performance, and the contract requirements.</Text>
          <TouchableOpacity style={s.genBtn} onPress={generate}>
            <Ionicons name="flash-outline" size={18} color={Colors.bg} />
            <Text style={s.genBtnText}>Generate Proposal</Text>
          </TouchableOpacity>
        </View>
      )}

      {generating && (
        <ScrollView style={s.streamContainer} contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={s.streamHeader}>
            <ActivityIndicator color={Colors.accent} size="small" />
            <Text style={s.streamLabel}>Writing proposal...</Text>
          </View>
          <Text style={s.streamText}>{streamText}<Text style={s.cursor}>▋</Text></Text>
        </ScrollView>
      )}

      {output && !generating && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
            {SECTIONS.map(sec => (
              <TouchableOpacity
                key={sec.key}
                style={[s.tab, activeSection === sec.key && s.tabActive]}
                onPress={() => setActiveSection(sec.key)}
              >
                <Ionicons name={sec.icon as any} size={14} color={activeSection === sec.key ? Colors.accent : Colors.textMuted} />
                <Text style={[s.tabText, activeSection === sec.key && s.tabTextActive]}>{sec.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView style={s.outputContainer} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
            <Text style={s.outputText}>{currentContent}</Text>
          </ScrollView>
          <View style={s.bottomBar}>
            <TouchableOpacity style={s.regenBtn} onPress={generate}>
              <Ionicons name="refresh-outline" size={16} color={Colors.textMuted} />
              <Text style={s.regenText}>Regenerate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.exportBtn} onPress={share}>
              <Ionicons name="document-text-outline" size={16} color={Colors.bg} />
              <Text style={s.exportText}>Export Proposal</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg },
  backBtn: { padding: 4, marginRight: Spacing.sm },
  title: { ...Typography.h4, flex: 1 },
  shareBtn: { padding: 4 },
  contractCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md },
  contractBadge: { backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder, borderRadius: Radius.sm, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  contractBadgeText: { ...Typography.label, color: Colors.accent, fontSize: 10 },
  contractTitle: { ...Typography.h4, marginBottom: 4 },
  contractMeta: { ...Typography.bodySmall },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  promptTitle: { ...Typography.h3, textAlign: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  promptSub: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  genBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingHorizontal: 28, paddingVertical: 14 },
  genBtnText: { fontSize: 15, fontWeight: '600', color: Colors.bg },
  streamContainer: { flex: 1 },
  streamHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.md },
  streamLabel: { ...Typography.label, color: Colors.accent },
  streamText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  cursor: { color: Colors.accent },
  tabs: { paddingHorizontal: Spacing.lg, gap: 6, paddingBottom: Spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.accentDim, borderColor: Colors.accentBorder },
  tabText: { fontSize: 12, color: Colors.textMuted },
  tabTextActive: { color: Colors.accent },
  outputContainer: { flex: 1 },
  outputText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 24 },
  bottomBar: { flexDirection: 'row', gap: 10, padding: Spacing.lg, paddingBottom: 32, borderTopWidth: 1, borderTopColor: Colors.border },
  regenBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md },
  regenText: { fontSize: 13, color: Colors.textMuted },
  exportBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: Radius.lg, padding: Spacing.md },
  exportText: { fontSize: 13, fontWeight: '600', color: Colors.bg },
});
