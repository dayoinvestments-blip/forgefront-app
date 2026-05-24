import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState, Job, addJob, updateJob } from '@/store';
import { formatCurrency } from '@/utils/format';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<Job['status'], { label: string; color: string; bg: string }> = {
  active:   { label: 'Active',   color: Colors.accent,  bg: Colors.accentDim },
  pending:  { label: 'Pending',  color: Colors.gold,    bg: Colors.goldDim },
  review:   { label: 'Review',   color: Colors.blue,    bg: Colors.blueDim },
  complete: { label: 'Complete', color: Colors.textMuted, bg: Colors.surface3 },
};

const STATUS_TABS: Job['status'][] = ['active', 'pending', 'review', 'complete'];

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Job Card ────────────────────────────────────────────────────────────────
function JobCard({ job, onInvoice }: { job: Job; onInvoice: (job: Job) => void }) {
  const cfg = STATUS_CONFIG[job.status];
  const progress = job.value > 0 ? Math.min((job.invoiced / job.value) * 100, 100) : 0;

  return (
    <View style={s.card}>
      {/* Top row */}
      <View style={s.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={s.jobName} numberOfLines={1}>{job.name}</Text>
          <Text style={s.jobClient}>{job.client}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Phase */}
      {job.phase ? (
        <View style={s.phaseRow}>
          <Ionicons name="git-branch-outline" size={12} color={Colors.textMuted} />
          <Text style={s.phaseText}>{job.phase}</Text>
        </View>
      ) : null}

      {/* Value & Invoiced */}
      <View style={s.valueRow}>
        <View style={s.valueBlock}>
          <Text style={s.valueLabel}>CONTRACT</Text>
          <Text style={s.valueAmount}>{formatCurrency(job.value)}</Text>
        </View>
        <View style={s.valueBlock}>
          <Text style={s.valueLabel}>INVOICED</Text>
          <Text style={[s.valueAmount, { color: Colors.accent }]}>{formatCurrency(job.invoiced)}</Text>
        </View>
        <View style={s.valueBlock}>
          <Text style={s.valueLabel}>REMAINING</Text>
          <Text style={[s.valueAmount, { color: Colors.gold }]}>{formatCurrency(Math.max(job.value - job.invoiced, 0))}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progress}%` as any }]} />
      </View>
      <Text style={s.progressLabel}>{progress.toFixed(0)}% invoiced</Text>

      {/* Invoice CTA */}
      {job.status !== 'complete' && (
        <TouchableOpacity style={s.invoiceBtn} onPress={() => onInvoice(job)}>
          <Ionicons name="receipt-outline" size={15} color={Colors.accent} />
          <Text style={s.invoiceBtnText}>Create Invoice</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Add Job Modal ────────────────────────────────────────────────────────────
function AddJobModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (job: Job) => void;
}) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState('');
  const [notes, setNotes] = useState('');

  function handleSave() {
    if (!name.trim() || !client.trim()) {
      Alert.alert('Required', 'Job name and client are required.');
      return;
    }
    const now = new Date().toISOString();
    onSave({
      id: uuid(),
      name: name.trim(),
      client: client.trim(),
      value: parseFloat(value) || 0,
      status: 'pending',
      phase: phase.trim(),
      startDate: now,
      estimatedEnd: '',
      invoiced: 0,
      notes: notes.trim(),
    });
    setName(''); setClient(''); setValue(''); setPhase(''); setNotes('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modalSafe} edges={['top', 'bottom']}>
        <View style={s.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.modalTitle}>New Job</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={s.modalSave}>Save</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          {[
            { label: 'Job Name *', value: name, setter: setName, placeholder: 'e.g. VA Fence Installation' },
            { label: 'Client *', value: client, setter: setClient, placeholder: 'Agency or company name' },
            { label: 'Contract Value ($)', value: value, setter: setValue, placeholder: '0.00', keyboard: 'decimal-pad' as const },
            { label: 'Current Phase', value: phase, setter: setPhase, placeholder: 'e.g. Phase 1 of 3' },
          ].map(f => (
            <View key={f.label} style={s.modalField}>
              <Text style={s.modalFieldLabel}>{f.label}</Text>
              <TextInput
                style={s.modalInput}
                value={f.value}
                onChangeText={f.setter}
                placeholder={f.placeholder}
                placeholderTextColor={Colors.textMuted}
                keyboardType={f.keyboard ?? 'default'}
              />
            </View>
          ))}
          <View style={s.modalField}>
            <Text style={s.modalFieldLabel}>Notes</Text>
            <TextInput
              style={[s.modalInput, { minHeight: 72, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Any relevant notes..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export function JobsScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const jobs = useSelector((s: RootState) => s.jobs.items);
  const invoices = useSelector((s: RootState) => s.invoices.items);
  const [activeTab, setActiveTab] = useState<Job['status']>('active');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = jobs.filter(j => j.status === activeTab);

  // Summary stats
  const totalPipeline = jobs.reduce((sum, j) => sum + j.value, 0);
  const totalInvoiced = jobs.reduce((sum, j) => sum + j.invoiced, 0);
  const invoiceCount = invoices.length;

  function handleInvoice(job: Job) {
    navigation.navigate('Invoice', { jobId: job.id });
  }

  function handleAddJob(job: Job) {
    dispatch(addJob(job));
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Job Tracker</Text>
          <Text style={s.subtitle}>{jobs.length} jobs · {invoiceCount} invoices</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={20} color={Colors.bg} />
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statBlock}>
          <Text style={s.statValue}>{formatCurrency(totalPipeline, true)}</Text>
          <Text style={s.statLabel}>Pipeline</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBlock}>
          <Text style={[s.statValue, { color: Colors.accent }]}>{formatCurrency(totalInvoiced, true)}</Text>
          <Text style={s.statLabel}>Invoiced</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBlock}>
          <Text style={[s.statValue, { color: Colors.gold }]}>{formatCurrency(Math.max(totalPipeline - totalInvoiced, 0), true)}</Text>
          <Text style={s.statLabel}>Remaining</Text>
        </View>
        <View style={s.statDivider} />
        <TouchableOpacity
          style={s.statBlock}
          onPress={() => navigation.navigate('Invoice', {})}
        >
          <Text style={[s.statValue, { color: Colors.blue }]}>{invoiceCount}</Text>
          <Text style={s.statLabel}>Invoices ›</Text>
        </TouchableOpacity>
      </View>

      {/* Status Tabs */}
      <View style={s.tabRow}>
        {STATUS_TABS.map(tab => {
          const cfg = STATUS_CONFIG[tab];
          const count = jobs.filter(j => j.status === tab).length;
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, isActive && { borderBottomColor: cfg.color, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[s.tabText, isActive && { color: cfg.color }]}>
                {cfg.label}
              </Text>
              {count > 0 && (
                <View style={[s.tabBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[s.tabBadgeText, { color: cfg.color }]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Job List */}
      <FlatList
        data={filtered}
        keyExtractor={j => j.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="briefcase-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyText}>No {STATUS_CONFIG[activeTab].label.toLowerCase()} jobs</Text>
            <Text style={s.emptyHint}>Tap + to add a new job</Text>
          </View>
        }
        renderItem={({ item }) => (
          <JobCard job={item} onInvoice={handleInvoice} />
        )}
      />

      <AddJobModal visible={showAdd} onClose={() => setShowAdd(false)} onSave={handleAddJob} />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { ...Typography.h3 },
  subtitle: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
  },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { ...Typography.h4, fontSize: 15 },
  statLabel: { ...Typography.label, fontSize: 9, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },

  tabRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, gap: 4, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 12, fontWeight: '500', color: Colors.textMuted },
  tabBadge: { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { fontSize: 10, fontWeight: '700' },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  jobName: { ...Typography.h4, fontSize: 14 },
  jobClient: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
  phaseText: { fontSize: 11, color: Colors.textMuted },

  valueRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  valueBlock: { flex: 1 },
  valueLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: Colors.textMuted, marginBottom: 2 },
  valueAmount: { fontSize: 13, fontWeight: '600', color: Colors.text },

  progressTrack: { height: 3, backgroundColor: Colors.surface3, borderRadius: 2, marginBottom: 4 },
  progressFill: { height: 3, backgroundColor: Colors.accent, borderRadius: 2 },
  progressLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: Spacing.md },

  invoiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accentDim,
    borderWidth: 1, borderColor: Colors.accentBorder,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  invoiceBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.accent },

  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  emptyHint: { ...Typography.bodySmall },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.h4 },
  modalCancel: { fontSize: 15, color: Colors.textSecondary },
  modalSave: { fontSize: 15, fontWeight: '600', color: Colors.accent },
  modalField: { marginBottom: Spacing.lg },
  modalFieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: 14, color: Colors.text,
  },
});
