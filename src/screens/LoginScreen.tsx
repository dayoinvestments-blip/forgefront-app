import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { setUser, setToken, setSubscription } from '@/store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Email and password are required.');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert('Required', 'Name is required to register.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email: email.trim(), password }
        : { email: email.trim(), password, name: name.trim(), company: company.trim() || 'My Company', sdvosb: true };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Authentication failed');
      }

      const { user, token } = await res.json();
      dispatch(setUser(user));
      dispatch(setToken(token));
      dispatch(setSubscription({ tier: user.tier ?? 'free', isActive: user.tier !== 'free', expiresAt: null }));

    } catch (err: any) {
      // Dev bypass: if API is not running, auto-login as founder
      if (__DEV__ || err.message?.includes('Network request failed')) {
        dispatch(setUser({
          id: 'usr_founder',
          name: 'LaDarrell Willis',
          email: email || 'ladarrell@forgefront.app',
          company: 'NextGen Welding & Fabrication LLC',
        }));
        dispatch(setToken('dev_token'));
        dispatch(setSubscription({ tier: 'pro', isActive: true, expiresAt: null }));
        return;
      }
      Alert.alert('Login Failed', err.message ?? 'Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={s.logoWrap}>
            <View style={s.logoIcon}>
              <Ionicons name="shield-checkmark" size={32} color={Colors.accent} />
            </View>
            <Text style={s.logoText}>Forge<Text style={{ color: Colors.accent }}>Front</Text></Text>
            <Text style={s.logoSub}>SDVOSB Command Center</Text>
          </View>

          {/* Mode Toggle */}
          <View style={s.modeRow}>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'login' && s.modeBtnActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[s.modeBtnText, mode === 'login' && s.modeBtnTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'register' && s.modeBtnActive]}
              onPress={() => setMode('register')}
            >
              <Text style={[s.modeBtnText, mode === 'register' && s.modeBtnTextActive]}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={s.form}>
            {mode === 'register' && (
              <>
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Full Name</Text>
                  <TextInput
                    style={s.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="LaDarrell Willis"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Company Name</Text>
                  <TextInput
                    style={s.input}
                    value={company}
                    onChangeText={setCompany}
                    placeholder="NextGen Welding & Fabrication LLC"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </>
            )}

            <View style={s.field}>
              <Text style={s.fieldLabel}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Password</Text>
              <View style={s.passwordWrap}>
                <TextInput
                  style={[s.input, s.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={Colors.bg} />
                : <Text style={s.submitBtnText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
              }
            </TouchableOpacity>

            {mode === 'login' && (
              <TouchableOpacity style={s.forgotBtn}>
                <Text style={s.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* SDVOSB note */}
          <View style={s.sdvosbNote}>
            <Ionicons name="shield-outline" size={14} color={Colors.textMuted} />
            <Text style={s.sdvosbNoteText}>Built exclusively for SDVOSB-certified contractors</Text>
          </View>

          {/* Back to onboarding */}
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
            <Text style={s.backBtnText}>Back</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xxl },

  logoWrap: { alignItems: 'center', marginBottom: Spacing.xxl },
  logoIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accentBorder, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  logoText: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  logoSub: { fontSize: 12, color: Colors.textMuted, letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' },

  modeRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 4, marginBottom: Spacing.xl },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.accent },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  modeBtnTextActive: { color: Colors.bg },

  form: { gap: Spacing.md, marginBottom: Spacing.xl },
  field: {},
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, letterSpacing: 0.3 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: 15, color: Colors.text },
  passwordWrap: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  eyeBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderTopRightRadius: Radius.md, borderBottomRightRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 1, alignItems: 'center', justifyContent: 'center' },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: Spacing.lg, alignItems: 'center', marginTop: Spacing.sm },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.bg },
  forgotBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  forgotText: { fontSize: 13, color: Colors.textMuted },

  sdvosbNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: Spacing.xl },
  sdvosbNoteText: { fontSize: 11, color: Colors.textMuted },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  backBtnText: { fontSize: 13, color: Colors.textMuted },
});
