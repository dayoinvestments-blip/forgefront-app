import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState } from '@/store';

// ─── Types ────────────────────────────────────────────────────────────────────
type AdminRole = 'superuser' | 'admin' | 'support' | 'user';
type Tab = 'overview' | 'users' | 'roles' | 'config';

interface MetricCard { label: string; value: string | number; sub?: string; color?: string; icon: string }
interface MockUser { id: string; name: string; email: string; company: string; tier: string; role: AdminRole; status: 'active' | 'suspended' }

const MOCK_USERS: MockUser[] = [
  { id: 'usr_founder', name: 'LaDarrell Willis', email: 'ladarrell@forgefront.app', company: 'NextGen Welding & Fabrication LLC', tier: 'pro', role: 'superuser', status: 'active' },
  { id: 'usr_002', name: 'Marcus Johnson', email: 'marcus@example.com', company: 'Johnson Steel Works', tier: 'pro', role: 'user', status: 'active' },
  { id: 'usr_003', name: 'Dana Reeves', email: 'dana@example.com', company: 'Gulf Fab LLC', tier: 'base', role: 'support', status: 'active' },
  { id: 'usr_004', name: 'Kevin Tran', email: 'kevin@example.com', company: 'Tran Metal Services', tier: 'free', role: 'user', status: 'active' },
];

const ROLE_COLORS: Record<AdminRole, string> = {
  superuser: '#FFB830',
  admin: '#4F8EF7',
  support: '#A78BFA',
  user: Colors.textMuted,
};

const TIER_COLORS: Record<string, string> = {
  pro: Colors.accent,
  base: Colors.blue,
  free: Colors.textMuted,
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function MetricTile({ card }: { card: MetricCard }) {
  return (
    <View style={styles.metricTile}>
      <Ionicons name={card.icon as any} size={18} color={card.color ?? Colors.accent} style={{ marginBottom: 6 }} />
      <Text style={[styles.metricValue, { color: card.color ?? Colors.text }]}>{card.value}</Text>
      <Text style={styles.metricLabel}>{card.label}</Text>
      {card.sub && <Text style={styles.metricSub}>{card.sub}</Text>}
    </View>
  );
}

function RoleBadge({ role }: { role: AdminRole }) {
  return (
    <View style={[styles.roleBadge, { backgroundColor: `${ROLE_COLORS[role]}20` }]}>
      <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[role] }]}>{role.toUpperCase()}</Text>
    </View>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <View style={[styles.tierBadge, { backgroundColor: `${TIER_COLORS[tier] ?? Colors.textMuted}20` }]}>
      <Text style={[styles.tierBadgeText, { color: TIER_COLORS[tier] ?? Colors.textMuted }]}>{tier.toUpperCase()}</Text>
    </View>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab() {
  const metrics: MetricCard[] = [
    { label: 'Total Users', value: MOCK_USERS.length, icon: 'people-outline', color: Colors.blue },
    { label: 'Pro Subscribers', value: MOCK_USERS.filter(u => u.tier === 'pro').length, icon: 'star-outline', color: Colors.accent },
    { label: 'MRR', value: '$237', sub: '+12% MoM', icon: 'cash-outline', color: Colors.gold },
    { label: 'Invoices Gen.', value: 0, icon: 'receipt-outline' },
    { label: 'Bids Written', value: 0, icon: 'create-outline' },
    { label: 'Contracts Fed', value: 0, icon: 'document-text-outline', color: Colors.blue },
  ];

  return (
    <View>
      <Text style={styles.sectionLabel}>PLATFORM METRICS</Text>
      <View style={styles.metricGrid}>
        {metrics.map(m => <MetricTile key={m.label} card={m} />)}
      </View>

      <Text style={styles.sectionLabel}>SOURCES STATUS</Text>
      {[
        { label: '🏛 Federal (SAM.gov)', status: 'Mock', color: Colors.gold },
        { label: '🏗 State/Local (BidNet)', status: 'Mock', color: Colors.gold },
        { label: '🤝 Subcontract (SBA SubNet)', status: 'Mock', color: Colors.gold },
      ].map(s => (
        <View key={s.label} style={styles.sourceRow}>
          <Text style={styles.sourceLabel}>{s.label}</Text>
          <View style={[styles.sourceBadge, { backgroundColor: `${s.color}20` }]}>
            <Text style={[styles.sourceBadgeText, { color: s.color }]}>{s.status}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.sourceNote}>
        Set SAM_GOV_API_KEY, BIDNET_API_KEY, and SBA_SUBNET_API_KEY in your backend .env to go live.
      </Text>

      <Text style={styles.sectionLabel}>REVENUE BREAKDOWN</Text>
      <View style={styles.revenueCard}>
        {[
          { tier: 'Pro ($79/mo)', count: 2, mrr: '$158' },
          { tier: 'Base ($29/mo)', count: 1, mrr: '$29' },
          { tier: 'Free', count: 1, mrr: '$0' },
        ].map(r => (
          <View key={r.tier} style={styles.revenueRow}>
            <Text style={styles.revenueTier}>{r.tier}</Text>
            <Text style={styles.revenueCount}>{r.count} users</Text>
            <Text style={styles.revenueMrr}>{r.mrr}</Text>
          </View>
        ))}
        <View style={[styles.revenueRow, styles.revenueTotalRow]}>
          <Text style={[styles.revenueTier, { color: Colors.text, fontWeight: '700' }]}>Total MRR</Text>
          <Text style={[styles.revenueMrr, { color: Colors.accent, fontSize: 16, fontWeight: '700' }]}>$187</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ isSuperuser }: { isSuperuser: boolean }) {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<MockUser | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>('user');

  const filtered = MOCK_USERS.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function handleEdit(user: MockUser) {
    setSelectedUser(user);
    setEditRole(user.role);
  }

  function handleSave() {
    if (!selectedUser) return;
    Alert.alert(
      'Role Updated',
      `${selectedUser.name} → ${editRole.toUpperCase()}\n\nConnect to your database to persist this change.`,
      [{ text: 'OK', onPress: () => setSelectedUser(null) }]
    );
  }

  return (
    <View>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <Text style={styles.sectionLabel}>{filtered.length} USERS</Text>
      {filtered.map(user => (
        <View key={user.id} style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{user.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <Text style={styles.userCompany}>{user.company}</Text>
            <View style={styles.userBadges}>
              <TierBadge tier={user.tier} />
              <RoleBadge role={user.role} />
              {user.status === 'suspended' && (
                <View style={styles.suspendedBadge}><Text style={styles.suspendedText}>SUSPENDED</Text></View>
              )}
            </View>
          </View>
          {(isSuperuser || user.role === 'user') && (
            <TouchableOpacity onPress={() => handleEdit(user)} style={styles.editBtn}>
              <Ionicons name="create-outline" size={18} color={Colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Edit Modal */}
      <Modal visible={!!selectedUser} animationType="slide" presentationStyle="pageSheet" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>Edit User</Text>
            {selectedUser && (
              <>
                <Text style={styles.editModalName}>{selectedUser.name}</Text>
                <Text style={styles.editModalEmail}>{selectedUser.email}</Text>

                <Text style={styles.editModalSection}>ASSIGN ROLE</Text>
                {(['user', 'support', 'admin', ...(isSuperuser ? ['superuser'] : [])] as AdminRole[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleOption, editRole === r && styles.roleOptionActive]}
                    onPress={() => setEditRole(r)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleOptionLabel, { color: ROLE_COLORS[r] }]}>{r.toUpperCase()}</Text>
                      <Text style={styles.roleOptionDesc}>
                        {r === 'user' && 'Standard app access based on subscription tier'}
                        {r === 'support' && 'View user data for customer service — no edit access'}
                        {r === 'admin' && 'Manage users, view metrics, assign support role'}
                        {r === 'superuser' && 'Full platform control — all features, all data'}
                      </Text>
                    </View>
                    {editRole === r && <Ionicons name="checkmark-circle" size={20} color={ROLE_COLORS[r]} />}
                  </TouchableOpacity>
                ))}

                <Text style={styles.editModalSection}>TIER</Text>
                <View style={styles.tierRow}>
                  {(['free', 'base', 'pro'] as const).map(t => (
                    <TouchableOpacity key={t} style={styles.tierOption}>
                      <TierBadge tier={t} />
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.editModalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedUser(null)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────
function ConfigTab() {
  const [flags, setFlags] = useState({
    stateLocalContracts: true,
    subnetOpportunities: true,
    pushNotifications: true,
    offlineMode: true,
    adminPanel: true,
    maintenanceMode: false,
  });

  const [limits, setLimits] = useState({
    freeContractLimit: '3',
    baseContractLimit: '25',
    proContractLimit: 'Unlimited',
  });

  function toggle(key: keyof typeof flags) {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));
    Alert.alert('Feature Flag Updated', `${key}: ${!flags[key]}\n\nConnect to your backend config to persist.`);
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>FEATURE FLAGS</Text>
      {Object.entries(flags).map(([key, val]) => (
        <View key={key} style={styles.configRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.configLabel}>{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
          </View>
          <Switch
            value={val}
            onValueChange={() => toggle(key as keyof typeof flags)}
            trackColor={{ false: Colors.border, true: Colors.accentBorder }}
            thumbColor={val ? Colors.accent : Colors.textMuted}
          />
        </View>
      ))}

      <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>CONTRACT LIMITS BY TIER</Text>
      {Object.entries(limits).map(([key, val]) => (
        <View key={key} style={styles.configRow}>
          <Text style={styles.configLabel}>{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
          <Text style={styles.configValue}>{val}</Text>
        </View>
      ))}

      <Text style={styles.sectionLabel}>ENV KEYS STATUS</Text>
      {[
        { key: 'SAM_GOV_API_KEY', label: 'SAM.gov API Key', hint: 'api.sam.gov' },
        { key: 'BIDNET_API_KEY', label: 'BidNet Direct API Key', hint: 'bidnetdirect.com' },
        { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', hint: 'dashboard.stripe.com' },
        { key: 'JWT_SECRET', label: 'JWT Secret', hint: 'Use a 64-char random string' },
        { key: 'REVENUECAT_API_KEY', label: 'RevenueCat API Key', hint: 'app.revenuecat.com' },
      ].map(e => (
        <View key={e.key} style={styles.envRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.envKey}>{e.label}</Text>
            <Text style={styles.envHint}>{e.hint}</Text>
          </View>
          <View style={styles.envStatus}>
            <Text style={styles.envStatusText}>Not Set</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main Admin Screen ────────────────────────────────────────────────────────
export function AdminScreen() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // In a real app, check user.role from the JWT. Mock: treat founder email as superuser.
  const isSuperuser = true;
  const isAdmin = true;

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.danger} />
          <Text style={styles.accessDeniedText}>Admin Access Required</Text>
          <Text style={styles.accessDeniedSub}>Your account does not have admin privileges.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'bar-chart-outline' },
    { id: 'users', label: 'Users', icon: 'people-outline' },
    { id: 'config', label: 'Config', icon: 'settings-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin Console</Text>
          <Text style={styles.headerSub}>
            <Text style={{ color: ROLE_COLORS.superuser }}>
              {isSuperuser ? '⚡ SUPERUSER' : '🛡 ADMIN'}
            </Text>
            {'  '}· {user?.name ?? 'LaDarrell Willis'}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>v2.0</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.tabActive]}
            onPress={() => setActiveTab(t.id)}
          >
            <Ionicons
              name={t.icon as any}
              size={16}
              color={activeTab === t.id ? Colors.accent : Colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'users' && <UsersTab isSuperuser={isSuperuser} />}
        {activeTab === 'config' && <ConfigTab />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  accessDeniedText: { ...Typography.h3, color: Colors.danger },
  accessDeniedSub: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { ...Typography.h3 },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  headerBadge: { backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  headerBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.gold },

  tabRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 12, color: Colors.textMuted },
  tabTextActive: { color: Colors.accent, fontWeight: '600' },

  scroll: { padding: Spacing.lg, paddingBottom: 60 },

  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.textMuted, marginTop: Spacing.lg, marginBottom: Spacing.sm },

  // Metrics
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  metricTile: { width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  metricValue: { ...Typography.h3, fontSize: 20, marginBottom: 2 },
  metricLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  metricSub: { fontSize: 9, color: Colors.accent, marginTop: 2 },

  // Sources
  sourceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 6 },
  sourceLabel: { flex: 1, fontSize: 13, color: Colors.text },
  sourceBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  sourceBadgeText: { fontSize: 11, fontWeight: '600' },
  sourceNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },

  // Revenue
  revenueCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, overflow: 'hidden' },
  revenueRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  revenueTotalRow: { borderBottomWidth: 0, backgroundColor: Colors.surface2 },
  revenueTier: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  revenueCount: { fontSize: 12, color: Colors.textMuted, width: 60, textAlign: 'center' },
  revenueMrr: { fontSize: 14, fontWeight: '600', color: Colors.text, width: 60, textAlign: 'right' },

  // Users
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 40, marginBottom: Spacing.sm },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  userCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  userName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  userEmail: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  userCompany: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  userBadges: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  editBtn: { padding: Spacing.sm },

  roleBadge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  tierBadge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  tierBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  suspendedBadge: { backgroundColor: `${Colors.danger}20`, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  suspendedText: { fontSize: 9, fontWeight: '700', color: Colors.danger },

  // Edit Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  editModal: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: 40 },
  editModalTitle: { ...Typography.h3, marginBottom: Spacing.sm },
  editModalName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  editModalEmail: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },
  editModalSection: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.textMuted, marginBottom: Spacing.sm, marginTop: Spacing.md },
  roleOption: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 6 },
  roleOptionActive: { borderColor: Colors.accentBorder, backgroundColor: Colors.accentDim },
  roleOptionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  roleOptionDesc: { fontSize: 11, color: Colors.textMuted },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierOption: { flex: 1, alignItems: 'center', padding: Spacing.sm },
  editModalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  cancelBtn: { flex: 1, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center' },
  saveBtnText: { color: Colors.bg, fontWeight: '700' },

  // Config
  configRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginBottom: 6 },
  configLabel: { flex: 1, fontSize: 13, color: Colors.text, textTransform: 'capitalize' },
  configValue: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  envRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginBottom: 6 },
  envKey: { fontSize: 12, fontWeight: '600', color: Colors.text },
  envHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  envStatus: { backgroundColor: `${Colors.gold}20`, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  envStatusText: { fontSize: 11, fontWeight: '600', color: Colors.gold },
});
