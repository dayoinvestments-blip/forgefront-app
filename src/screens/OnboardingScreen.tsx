import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { setUser } from '@/store';

const { width: W } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: string;
  iconColor: string;
  tag: string;
  title: string;
  description: string;
  highlight?: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'shield-checkmark-outline',
    iconColor: Colors.accent,
    tag: 'FOR SDVOSB CONTRACTORS',
    title: 'Your SDVOSB Advantage — Unlocked',
    description: 'ForgeFront is built exclusively for service-disabled veteran-owned businesses. Every contract match, every proposal, every invoice — built around your certifications.',
    highlight: 'Set-aside contracts reserved for veterans. No more searching — we bring them to you.',
  },
  {
    id: '2',
    icon: 'document-text-outline',
    iconColor: Colors.blue,
    tag: 'CONTRACT INTELLIGENCE',
    title: 'Federal, State, Local & Subcontracts — One Feed',
    description: 'We pull from SAM.gov (federal), BidNet Direct (state & local), and SBA SubNet (subcontracting) and match every opportunity to your NAICS codes and certifications.',
    highlight: '🏛 Federal   🏗 State/Local   🤝 Subcontract',
  },
  {
    id: '3',
    icon: 'create-outline',
    iconColor: Colors.gold,
    tag: 'AI BID WRITER',
    title: 'Go from Contract to Proposal in 60 Seconds',
    description: 'Select any matched contract and our AI generates a compliant SDVOSB proposal — executive summary, technical approach, past performance, and pricing narrative included.',
    highlight: 'Pro users get 20 AI proposals per day.',
  },
  {
    id: '4',
    icon: 'receipt-outline',
    iconColor: '#A78BFA',
    tag: 'JOB TRACKER + INVOICING',
    title: 'Track Jobs. Invoice Clients. Get Paid.',
    description: 'Manage every active job, track phases and crew certifications, and generate professional PDF invoices sent directly from your phone.',
    highlight: 'Full PDF invoice → native share sheet → email or text to client.',
  },
];

const NAICS_OPTIONS = [
  { code: '332312', label: 'Structural Steel Fabrication' },
  { code: '238190', label: 'Welding & Metal Work' },
  { code: '236220', label: 'Commercial Construction' },
  { code: '561210', label: 'Facilities Support' },
  { code: '237310', label: 'Highway & Bridge Construction' },
];

const SET_ASIDE_OPTIONS = ['SDVOSB', 'VOSB', 'Small Business', '8(a)', 'HUBZone'];

export function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedNaics, setSelectedNaics] = useState<string[]>(['332312']);
  const [selectedSetAsides, setSelectedSetAsides] = useState<string[]>(['SDVOSB']);
  const flatListRef = useRef<FlatList>(null);

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(prev => prev + 1);
    } else {
      setShowSetup(true);
    }
  }

  function handleSkip() {
    setShowSetup(true);
  }

  function toggleNaics(code: string) {
    setSelectedNaics(prev =>
      prev.includes(code) ? prev.filter(n => n !== code) : [...prev, code]
    );
  }

  function toggleSetAside(sa: string) {
    setSelectedSetAsides(prev =>
      prev.includes(sa) ? prev.filter(s => s !== sa) : [...prev, sa]
    );
  }

  function handleComplete() {
    // In production: save to DB + JWT
    dispatch(setUser({
      id: `usr_${Date.now()}`,
      name: 'LaDarrell Willis',
      email: 'ladarrell@forgefront.app',
      company: 'NextGen Welding & Fabrication LLC',
    }));
    navigation.replace('Main');
  }

  if (showSetup) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.setupContainer}>
          <View style={styles.setupIcon}>
            <Ionicons name="settings-outline" size={32} color={Colors.accent} />
          </View>
          <Text style={styles.setupTitle}>Quick Setup</Text>
          <Text style={styles.setupSub}>This helps us match contracts to your business. You can change these any time.</Text>

          <Text style={styles.setupSectionLabel}>YOUR NAICS CODES</Text>
          <View style={styles.optionGrid}>
            {NAICS_OPTIONS.map(n => (
              <TouchableOpacity
                key={n.code}
                style={[styles.optionChip, selectedNaics.includes(n.code) && styles.optionChipActive]}
                onPress={() => toggleNaics(n.code)}
              >
                {selectedNaics.includes(n.code) && (
                  <Ionicons name="checkmark-circle" size={14} color={Colors.accent} />
                )}
                <View>
                  <Text style={[styles.optionChipCode, selectedNaics.includes(n.code) && { color: Colors.accent }]}>
                    {n.code}
                  </Text>
                  <Text style={styles.optionChipLabel}>{n.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.setupSectionLabel}>YOUR CERTIFICATIONS / SET-ASIDES</Text>
          <View style={styles.pillRow}>
            {SET_ASIDE_OPTIONS.map(sa => (
              <TouchableOpacity
                key={sa}
                style={[styles.pill, selectedSetAsides.includes(sa) && styles.pillActive]}
                onPress={() => toggleSetAside(sa)}
              >
                <Text style={[styles.pillText, selectedSetAsides.includes(sa) && styles.pillTextActive]}>
                  {sa}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
            <Text style={styles.completeBtnText}>Enter ForgeFront</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.bg} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={s => s.id}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / W));
        }}
        renderItem={({ item: slide }) => (
          <View style={[styles.slide, { width: W }]}>
            <View style={[styles.slideIconWrap, { backgroundColor: `${slide.iconColor}20` }]}>
              <Ionicons name={slide.icon as any} size={52} color={slide.iconColor} />
            </View>
            <Text style={[styles.slideTag, { color: slide.iconColor }]}>{slide.tag}</Text>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideDesc}>{slide.description}</Text>
            {slide.highlight && (
              <View style={styles.slideHighlight}>
                <Text style={styles.slideHighlightText}>{slide.highlight}</Text>
              </View>
            )}
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Next / Get Started */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.nextBtn, currentIndex === SLIDES.length - 1 && styles.nextBtnFull]}
          onPress={handleNext}
        >
          <Text style={styles.nextBtnText}>
            {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.bg} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  skipText: { fontSize: 14, color: Colors.textMuted },

  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  slideIconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xl },
  slideTag: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: Spacing.sm },
  slideTitle: { ...Typography.h2, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 30 },
  slideDesc: { ...Typography.body, textAlign: 'center', color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.lg },
  slideHighlight: { backgroundColor: Colors.surface2, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  slideHighlightText: { fontSize: 13, color: Colors.text, textAlign: 'center', fontWeight: '500' },

  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: Spacing.lg },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { width: 20, backgroundColor: Colors.accent },

  navRow: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: Spacing.lg },
  nextBtnFull: { backgroundColor: Colors.accent },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: Colors.bg },

  // Setup
  setupContainer: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  setupIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  setupTitle: { ...Typography.h2, marginBottom: Spacing.sm },
  setupSub: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl, lineHeight: 22 },
  setupSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.textMuted, marginBottom: Spacing.sm, marginTop: Spacing.md },
  optionGrid: { gap: 6 },
  optionChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  optionChipActive: { borderColor: Colors.accentBorder, backgroundColor: Colors.accentDim },
  optionChipCode: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  optionChipLabel: { fontSize: 11, color: Colors.textMuted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.accentDim, borderColor: Colors.accentBorder },
  pillText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  pillTextActive: { color: Colors.accent },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: Spacing.lg, marginTop: Spacing.xl },
  completeBtnText: { fontSize: 16, fontWeight: '700', color: Colors.bg },
});
