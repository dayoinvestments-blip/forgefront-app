import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState } from '@/store';
import { formatCurrency, formatRelativeDate } from '@/utils/format';

type DetailRoute = { ContractDetail: { contractId: string } };

// ─── Info Row ────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, accent }: {
  icon: string; label: string; value: string; accent?: boolean;
}) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon as any} size={15} color={Colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, accent && { color: Colors.accent }]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export function ContractDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<DetailRoute, 'ContractDetail'>>();
  const { contractId } = route.params ?? {};
  const { tier } = useSelector((state: RootState) => state.subscription);
  const contract = useSelector((state: RootState) =>
    state.contracts.items.find(c => c.id === contractId)
  );

  if (!contract) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.notFound}>
          <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
          <Text style={s.notFoundText}>Contract not found</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isPro = tier === 'pro';
  const daysLeft = Math.ceil((new Date(contract.dueDate).getTime() - Date.now()) / 86400000);
  const isUrgent = daysLeft >= 0 && daysLeft <= 7;
  const isClosed = contract.status === 'closed' || daysLeft < 0;

  const statusColors: Record<string, string> = {
    open: Colors.accent,
    bidding: Colors.blue,
    closed: Colors.textMuted,
    awarded: Colors.gold,
  };
  const statusColor = statusColors[contract.status] ?? Colors.textMuted;

  function handleBidWriter() {
    if (!isPro) {
      navigation.navigate('Paywall');
      return;
    }
    navigation.navigate('BidWriter', { contractId: contract.id });
  }

  function handleSamGovLink() {
    const url = `https://sam.gov/opp/${contract.id}/view`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open SAM.gov', 'Copy the solicitation number and search manually.')
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Nav */}
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.navBack}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>Contract Detail</Text>
        <TouchableOpacity onPress={handleSamGovLink} style={s.navBack}>
          <Ionicons name="open-outline" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header Card */}
        <View style={s.headerCard}>
          <View style={s.headerTop}>
            <View style={[s.sourceIcon, { backgroundColor: `${statusColor}20` }]}>
              <Ionicons name="document-text-outline" size={20} color={statusColor} />
            </View>
            <View style={[s.statusPill, { backgroundColor: `${statusColor}20` }]}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.statusText, { color: statusColor }]}>
                {contract.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={s.contractTitle}>{contract.title}</Text>
          <Text style={s.agencyText}>{contract.agency}</Text>

          <View style={s.valueBadgeRow}>
            <View style={s.valueBadge}>
              <Text style={s.valueBadgeLabel}>EST. VALUE</Text>
              <Text style={s.valueBadgeAmount}>
                {contract.value > 0 ? formatCurrency(contract.value) : 'Undisclosed'}
              </Text>
            </View>
            <View style={[s.deadlineBadge, isUrgent && s.urgentBadge]}>
              <Ionicons
                name="time-outline"
                size={13}
                color={isUrgent ? Colors.danger : Colors.textSecondary}
              />
              <Text style={[s.deadlineText, isUrgent && { color: Colors.danger }]}>
                {isClosed ? 'Closed'
                  : daysLeft === 0 ? 'Due today'
                  : `${daysLeft} days left`}
              </Text>
            </View>
          </View>
        </View>

        {/* Set-Aside */}
        {contract.setAside && (
          <View style={s.setAsideBanner}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent} />
            <Text style={s.setAsideText}>{contract.setAside}</Text>
          </View>
        )}

        {/* Details */}
        <Section title="CONTRACT DETAILS">
          <InfoRow icon="document-outline" label="Solicitation Number" value={contract.solicitionNumber} />
          <InfoRow icon="business-outline" label="Agency" value={contract.agency} />
          <InfoRow icon="grid-outline" label="NAICS Code" value={contract.naicsCode} accent />
          <InfoRow icon="location-outline" label="Place of Performance" value={contract.location} />
          <InfoRow icon="calendar-outline" label="Response Deadline"
            value={contract.dueDate ? new Date(contract.dueDate).toLocaleDateString('en-US', {
              weekday: 'short', year: 'numeric', month: 'long', day: 'numeric'
            }) : '—'}
          />
          <InfoRow
            icon="cash-outline"
            label="Estimated Value"
            value={contract.value > 0 ? formatCurrency(contract.value) : 'See solicitation'}
            accent
          />
        </Section>

        {/* Description */}
        {contract.description ? (
          <Section title="DESCRIPTION">
            <Text style={s.descriptionText}>{contract.description}</Text>
          </Section>
        ) : null}

        {/* Bid Writer CTA */}
        {!isClosed && (
          <Section title="AI BID WRITER">
            <TouchableOpacity
              style={[s.bidBtn, !isPro && s.bidBtnLocked]}
              onPress={handleBidWriter}
              activeOpacity={0.85}
            >
              <View style={s.bidBtnLeft}>
                <Ionicons
                  name={isPro ? 'create-outline' : 'lock-closed-outline'}
                  size={22}
                  color={isPro ? Colors.bg : Colors.gold}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.bidBtnTitle, !isPro && { color: Colors.gold }]}>
                  {isPro ? 'Generate AI Proposal' : 'Unlock AI Proposal Writer'}
                </Text>
                <Text style={[s.bidBtnSub, !isPro && { color: Colors.gold + '99' }]}>
                  {isPro
                    ? 'Full SDVOSB proposal in ~60 seconds'
                    : 'Pro feature · Upgrade to $79/mo'}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isPro ? Colors.bg : Colors.gold}
              />
            </TouchableOpacity>
          </Section>
        )}

        {/* SAM.gov Link */}
        <TouchableOpacity style={s.samLink} onPress={handleSamGovLink}>
          <Ionicons name="globe-outline" size={16} color={Colors.blue} />
          <Text style={s.samLinkText}>View full solicitation on SAM.gov</Text>
          <Ionicons name="open-outline" size={14} color={Colors.blue} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navBack: { padding: Spacing.sm },
  navTitle: { ...Typography.h4, flex: 1, textAlign: 'center' },

  scroll: { padding: Spacing.lg, paddingBottom: 48 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundText: { ...Typography.h4, color: Colors.textSecondary },
  backBtn: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  backBtnText: { color: Colors.text, fontWeight: '600' },

  headerCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sourceIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  contractTitle: { ...Typography.h3, marginBottom: Spacing.sm, lineHeight: 26 },
  agencyText: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },
  valueBadgeRow: { flexDirection: 'row', gap: Spacing.sm },
  valueBadge: { flex: 1, backgroundColor: Colors.accentDim, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accentBorder, padding: Spacing.md },
  valueBadgeLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: Colors.accent, marginBottom: 3 },
  valueBadgeAmount: { fontSize: 18, fontWeight: '700', color: Colors.accent },
  deadlineBadge: { backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 5 },
  urgentBadge: { backgroundColor: `${Colors.danger}15`, borderColor: `${Colors.danger}40` },
  deadlineText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  setAsideBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md,
  },
  setAsideText: { fontSize: 13, fontWeight: '600', color: Colors.accent },

  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.textMuted, marginBottom: Spacing.sm },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    marginBottom: 5,
  },
  infoLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2, letterSpacing: 0.3 },
  infoValue: { fontSize: 14, fontWeight: '500', color: Colors.text },

  descriptionText: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 22,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
  },

  bidBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.accent, borderRadius: Radius.lg, padding: Spacing.lg,
  },
  bidBtnLocked: { backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder },
  bidBtnLeft: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  bidBtnTitle: { fontSize: 15, fontWeight: '700', color: Colors.bg, marginBottom: 2 },
  bidBtnSub: { fontSize: 12, color: `${Colors.bg}CC` },

  samLink: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    justifyContent: 'center', paddingVertical: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
  },
  samLinkText: { fontSize: 14, color: Colors.blue, fontWeight: '500' },
});
