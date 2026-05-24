import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { showMessage } from 'react-native-flash-message';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RevenueCatService, PurchasesPackage } from '@/services/RevenueCatService';

const BASE_FEATURES = [
  'SAM.gov contract feed (NAICS matched)',
  'Up to 5 active jobs',
  'Crew roster (up to 5 members)',
  'Basic invoicing',
  'SDVOSB opportunity alerts',
];

const PRO_FEATURES = [
  'AI bid writer — unlimited proposals',
  'Unlimited jobs & crew',
  'Auto invoice + payment reminders',
  'Cert expiration alerts',
  'Priority SAM.gov matching',
  'Export proposals to PDF',
  'Dedicated SDVOSB support',
];

export function PaywallScreen() {
  const navigation = useNavigation<any>();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [selected, setSelected] = useState<'base' | 'pro'>('pro');

  useEffect(() => {
    RevenueCatService.getOfferings().then(pkgs => {
      setPackages(pkgs);
      setLoading(false);
    });
  }, []);

  const purchase = async (pkg: PurchasesPackage | undefined) => {
    if (!pkg) {
      // Dev mode — simulate
      showMessage({ message: 'Subscribed!', type: 'success' });
      navigation.goBack();
      return;
    }
    setPurchasing(pkg.identifier);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await RevenueCatService.purchasePackage(pkg);
    setPurchasing(null);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showMessage({ message: 'Welcome to ForgeFront Pro!', type: 'success' });
      navigation.goBack();
    } else if (!result.cancelled) {
      Alert.alert('Purchase failed', 'Please try again.');
    }
  };

  const restore = async () => {
    const result = await RevenueCatService.restorePurchases();
    if (result.success) {
      showMessage({ message: 'Purchases restored', type: 'success' });
      navigation.goBack();
    } else {
      Alert.alert('Nothing to restore', 'No previous purchases found.');
    }
  };

  const basePackage = packages.find(p => p.identifier.includes('base'));
  const proPackage = packages.find(p => p.identifier.includes('pro_monthly'));

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.badge}><Text style={s.badgeText}>UPGRADE FORGEFRONT</Text></View>
        <Text style={s.headline}>Win more federal contracts</Text>
        <Text style={s.subline}>AI-powered tools built for SDVOSB and veteran-owned trade businesses</Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Plan selector */}
            <View style={s.planRow}>
              {/* Base Plan */}
              <TouchableOpacity
                style={[s.planCard, selected === 'base' && s.planCardSelected]}
                onPress={() => setSelected('base')}
                activeOpacity={0.85}
              >
                <Text style={s.planName}>Base</Text>
                <Text style={s.planPrice}>
                  {basePackage?.product.priceString ?? '$29'}
                  <Text style={s.planPer}>/mo</Text>
                </Text>
                <View style={s.featureList}>
                  {BASE_FEATURES.map(f => (
                    <View key={f} style={s.featureRow}>
                      <Ionicons name="checkmark" size={14} color={Colors.accent} />
                      <Text style={s.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={s.planBtn}
                  onPress={() => purchase(basePackage)}
                  disabled={!!purchasing}
                >
                  {purchasing === basePackage?.identifier
                    ? <ActivityIndicator color={Colors.text} size="small" />
                    : <Text style={s.planBtnText}>Start free trial</Text>}
                </TouchableOpacity>
              </TouchableOpacity>

              {/* Pro Plan */}
              <TouchableOpacity
                style={[s.planCard, s.planCardPro, selected === 'pro' && s.planCardSelected]}
                onPress={() => setSelected('pro')}
                activeOpacity={0.85}
              >
                <View style={s.popularBadge}><Text style={s.popularText}>MOST POPULAR</Text></View>
                <Text style={s.planName}>Pro</Text>
                <Text style={[s.planPrice, { color: Colors.accent }]}>
                  {proPackage?.product.priceString ?? '$79'}
                  <Text style={s.planPer}>/mo</Text>
                </Text>
                <View style={s.featureList}>
                  {PRO_FEATURES.map(f => (
                    <View key={f} style={s.featureRow}>
                      <Ionicons name="checkmark" size={14} color={Colors.accent} />
                      <Text style={s.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={s.planBtnPro}
                  onPress={() => purchase(proPackage)}
                  disabled={!!purchasing}
                >
                  {purchasing === proPackage?.identifier
                    ? <ActivityIndicator color={Colors.bg} size="small" />
                    : <Text style={s.planBtnProText}>Upgrade to Pro</Text>}
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            <Text style={s.legal}>14-day free trial · Cancel anytime · Billed through {'\n'}Apple App Store or Google Play</Text>
            <TouchableOpacity onPress={restore} style={s.restoreBtn}>
              <Text style={s.restoreText}>Restore purchases</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.lg },
  closeBtn: { padding: 4 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60, alignItems: 'center' },
  badge: { backgroundColor: Colors.goldDim, borderWidth: 1, borderColor: Colors.goldBorder, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 5, marginBottom: Spacing.lg },
  badgeText: { ...Typography.label, color: Colors.gold },
  headline: { ...Typography.h2, textAlign: 'center', marginBottom: Spacing.sm },
  subline: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  planRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: Spacing.lg },
  planCard: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.md },
  planCardPro: { backgroundColor: 'rgba(0,229,160,0.04)' },
  planCardSelected: { borderColor: Colors.accent, borderWidth: 1.5 },
  popularBadge: { backgroundColor: Colors.accent, borderRadius: Radius.sm, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  popularText: { fontSize: 9, fontWeight: '700', color: Colors.bg, letterSpacing: 0.5 },
  planName: { ...Typography.label, marginBottom: 6 },
  planPrice: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  planPer: { fontSize: 13, fontWeight: '400', color: Colors.textMuted },
  featureList: { gap: 8, marginBottom: Spacing.md },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  featureText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  planBtn: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10, alignItems: 'center', marginTop: 'auto' },
  planBtnText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  planBtnPro: { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: 10, alignItems: 'center', marginTop: 'auto' },
  planBtnProText: { fontSize: 13, color: Colors.bg, fontWeight: '600' },
  legal: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.sm },
  restoreBtn: { padding: Spacing.sm },
  restoreText: { fontSize: 13, color: Colors.textMuted, textDecorationLine: 'underline' },
});
