import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Certification {
  id: string;
  name: string;
  expiresAt: string; // ISO date
}

interface CrewMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  certifications: Certification[];
  hireDate: string;
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const INITIAL_CREW: CrewMember[] = [
  {
    id: 'crew_001',
    name: 'James Willis Sr.',
    role: 'Master Welder / Lead',
    phone: '318-555-0141',
    email: 'james@nextgenwelding.com',
    status: 'active',
    hireDate: '2024-01-01',
    certifications: [
      { id: 'c1', name: 'AWS Certified Welder (SMAW)', expiresAt: new Date(Date.now() + 180 * 86400000).toISOString() },
      { id: 'c2', name: 'OSHA 30 Construction', expiresAt: new Date(Date.now() + 400 * 86400000).toISOString() },
      { id: 'c3', name: 'CWI - Certified Welding Inspector', expiresAt: new Date(Date.now() + 10 * 86400000).toISOString() },
    ],
  },
  {
    id: 'crew_002',
    name: 'Marcus Thompson',
    role: 'Fabricator',
    phone: '318-555-0192',
    email: '',
    status: 'active',
    hireDate: '2024-03-15',
    certifications: [
      { id: 'c4', name: 'OSHA 10 Construction', expiresAt: new Date(Date.now() + 60 * 86400000).toISOString() },
    ],
  },
  {
    id: 'crew_003',
    name: 'Devon Carter',
    role: 'Apprentice Welder',
    phone: '318-555-0257',
    email: '',
    status: 'active',
    hireDate: '2024-06-01',
    certifications: [],
  },
];

// ─── Cert expiration helper ───────────────────────────────────────────────────
function certStatus(expiresAt: string): { label: string; color: string; bg: string; daysLeft: number } {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0)  return { label: 'Expired',        color: Colors.danger, bg: `${Colors.danger}15`,  daysLeft: days };
  if (days <= 14) return { label: `${days}d left`,  color: Colors.danger, bg: `${Colors.danger}15`,  daysLeft: days };
  if (days <= 30) return { label: `${days}d left`,  color: Colors.gold,   bg: Colors.goldDim,        daysLeft: days };
  return           { label: `${days}d left`,         color: Colors.accent, bg: Colors.accentDim,      daysLeft: days };
}

// ─── CertBadge ───────────────────────────────────────────────────────────────
function CertBadge({ cert }: { cert: Certification }) {
  const st = certStatus(cert.expiresAt);
  return (
    <View style={[styles.certBadge, { backgroundColor: st.bg, borderColor: `${st.color}40` }]}>
      <Text style={styles.certName}>{cert.name}</Text>
      <View style={styles.certExpiry}>
        <Ionicons name="time-outline" size={11} color={st.color} />
        <Text style={[styles.certExpiryText, { color: st.color }]}>{st.label}</Text>
      </View>
    </View>
  );
}

// ─── Crew Card ───────────────────────────────────────────────────────────────
function CrewCard({ member, onPress }: { member: CrewMember; onPress: () => void }) {
  const expiringSoon = member.certifications.filter(c => {
    const d = certStatus(c.expiresAt);
    return d.daysLeft <= 30;
  }).length;

  return (
    <TouchableOpacity style={styles.crewCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.crewAvatar}>
        <Text style={styles.crewAvatarText}>{member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.crewName}>{member.name}</Text>
        <Text style={styles.crewRole}>{member.role}</Text>
        <View style={styles.crewMeta}>
          <Text style={styles.crewMetaText}>
            {member.certifications.length} cert{member.certifications.length !== 1 ? 's' : ''}
          </Text>
          {expiringSoon > 0 && (
            <View style={styles.alertBadge}>
              <Ionicons name="warning-outline" size={11} color={Colors.danger} />
              <Text style={styles.alertBadgeText}>{expiringSoon} expiring</Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.statusDot, { backgroundColor: member.status === 'active' ? Colors.accent : Colors.textMuted }]} />
    </TouchableOpacity>
  );
}

// ─── Member Detail Modal ──────────────────────────────────────────────────────
function MemberModal({ member, onClose }: { member: CrewMember; onClose: () => void }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{member.name}</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.memberDetailCard}>
            <View style={styles.memberDetailAvatar}>
              <Text style={styles.memberDetailAvatarText}>
                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </Text>
            </View>
            <Text style={styles.memberDetailName}>{member.name}</Text>
            <Text style={styles.memberDetailRole}>{member.role}</Text>
            <View style={[styles.memberStatusBadge, {
              backgroundColor: member.status === 'active' ? Colors.accentDim : Colors.surface2
            }]}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: member.status === 'active' ? Colors.accent : Colors.textMuted }}>
                {member.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {member.phone ? (
            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.detailRowText}>{member.phone}</Text>
            </View>
          ) : null}
          {member.email ? (
            <View style={styles.detailRow}>
              <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.detailRowText}>{member.email}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.detailRowText}>
              Hired {new Date(member.hireDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          </View>

          <Text style={styles.certSectionLabel}>CERTIFICATIONS</Text>
          {member.certifications.length === 0 ? (
            <View style={styles.noCerts}>
              <Ionicons name="ribbon-outline" size={28} color={Colors.textMuted} />
              <Text style={styles.noCertsText}>No certifications on file</Text>
            </View>
          ) : (
            member.certifications.map(cert => <CertBadge key={cert.id} cert={cert} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────
function AddMemberModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (m: CrewMember) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function handleSave() {
    if (!name.trim()) { Alert.alert('Required', 'Name is required.'); return; }
    onSave({
      id: uuid(),
      name: name.trim(),
      role: role.trim() || 'Crew Member',
      phone: phone.trim(),
      email: email.trim(),
      status: 'active',
      certifications: [],
      hireDate: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Add Crew Member</Text>
          <TouchableOpacity onPress={handleSave}><Text style={styles.modalSave}>Add</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          {[
            { label: 'Full Name *', value: name, setter: setName, placeholder: 'James Willis' },
            { label: 'Role / Title', value: role, setter: setRole, placeholder: 'Welder, Fabricator, Apprentice...' },
            { label: 'Phone', value: phone, setter: setPhone, placeholder: '318-555-0100', keyboard: 'phone-pad' as const },
            { label: 'Email', value: email, setter: setEmail, placeholder: 'crew@example.com', keyboard: 'email-address' as const },
          ].map(f => (
            <View key={f.label} style={styles.addField}>
              <Text style={styles.addFieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.addInput}
                value={f.value}
                onChangeText={f.setter}
                placeholder={f.placeholder}
                placeholderTextColor={Colors.textMuted}
                keyboardType={f.keyboard ?? 'default'}
                autoCapitalize={f.keyboard ? 'none' : 'words'}
              />
            </View>
          ))}
          <Text style={styles.addHint}>
            Certifications can be added after saving the member.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function CrewScreen() {
  const [crew, setCrew] = useState<CrewMember[]>(INITIAL_CREW);
  const [selected, setSelected] = useState<CrewMember | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const activeCount = crew.filter(m => m.status === 'active').length;
  const totalCerts = crew.reduce((sum, m) => sum + m.certifications.length, 0);
  const expiringCount = crew.reduce((sum, m) =>
    sum + m.certifications.filter(c => certStatus(c.expiresAt).daysLeft <= 30).length, 0
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Crew</Text>
          <Text style={styles.subtitle}>{activeCount} active · {totalCerts} certs on file</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={20} color={Colors.bg} />
        </TouchableOpacity>
      </View>

      {/* Alert Banner */}
      {expiringCount > 0 && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning-outline" size={16} color={Colors.danger} />
          <Text style={styles.alertBannerText}>
            {expiringCount} certification{expiringCount > 1 ? 's' : ''} expiring within 30 days
          </Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: Colors.blue }]}>{totalCerts}</Text>
          <Text style={styles.statLabel}>Certs</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: expiringCount > 0 ? Colors.danger : Colors.accent }]}>
            {expiringCount}
          </Text>
          <Text style={styles.statLabel}>Expiring</Text>
        </View>
      </View>

      <FlatList
        data={crew}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No crew members yet</Text>
            <Text style={styles.emptyHint}>Tap + to add your first crew member</Text>
          </View>
        }
        renderItem={({ item }) => (
          <CrewCard member={item} onPress={() => setSelected(item)} />
        )}
      />

      {selected && <MemberModal member={selected} onClose={() => setSelected(null)} />}
      {showAdd && (
        <AddMemberModal
          onClose={() => setShowAdd(false)}
          onSave={member => setCrew(prev => [...prev, member])}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { ...Typography.h3 },
  subtitle: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: `${Colors.danger}15`, borderWidth: 1, borderColor: `${Colors.danger}30`, borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.md },
  alertBannerText: { fontSize: 13, fontWeight: '500', color: Colors.danger, flex: 1 },

  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, paddingVertical: Spacing.md },
  statBlock: { flex: 1, alignItems: 'center' },
  statValue: { ...Typography.h4, fontSize: 20 },
  statLabel: { fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5, marginTop: 2, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  crewCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8 },
  crewAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface3, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  crewAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  crewName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  crewRole: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  crewMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  crewMetaText: { fontSize: 11, color: Colors.textMuted },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${Colors.danger}15`, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  alertBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.danger },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  certBadge: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: 6 },
  certName: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 4 },
  certExpiry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  certExpiryText: { fontSize: 11, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  emptyHint: { ...Typography.bodySmall },

  modalSafe: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { ...Typography.h4 },
  modalCancel: { fontSize: 15, color: Colors.textSecondary },
  modalSave: { fontSize: 15, fontWeight: '600', color: Colors.accent },

  memberDetailCard: { alignItems: 'center', paddingVertical: Spacing.xl, marginBottom: Spacing.lg },
  memberDetailAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accentDim, borderWidth: 2, borderColor: Colors.accentBorder, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  memberDetailAvatarText: { fontSize: 24, fontWeight: '700', color: Colors.accent },
  memberDetailName: { ...Typography.h3, marginBottom: 4 },
  memberDetailRole: { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.md },
  memberStatusBadge: { borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailRowText: { fontSize: 14, color: Colors.text },
  certSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.textMuted, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  noCerts: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  noCertsText: { fontSize: 13, color: Colors.textMuted },

  addField: { marginBottom: Spacing.lg },
  addFieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, letterSpacing: 0.5 },
  addInput: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: 14, color: Colors.text },
  addHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
});
