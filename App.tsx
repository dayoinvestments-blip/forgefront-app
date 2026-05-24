import 'react-native-gesture-handler';
import React, { useEffect, Component } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { RootNavigator } from '@/navigation/RootNavigator';
import { RevenueCatService } from '@/services/RevenueCatService';

// ─── ErrorBoundary — catches runtime crashes so the screen isn't blank white ──
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[ForgeFront ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>ForgeFront</Text>
          <Text style={eb.subtitle}>Something went wrong loading the app.</Text>
          <Text style={eb.errorText}>{this.state.error}</Text>
          <TouchableOpacity
            style={eb.btn}
            onPress={() => this.setState({ hasError: false, error: '' })}
          >
            <Text style={eb.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0C0F', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#F0F2F5', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#A8B3C0', textAlign: 'center', marginBottom: 16 },
  errorText: { fontSize: 12, color: '#FF5A5A', textAlign: 'center', fontFamily: 'monospace', marginBottom: 32, lineHeight: 18 },
  btn: { backgroundColor: '#00E5A0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#0A0C0F' },
});

// ─── FlashMessage — lazy import so it doesn't crash on web if unsupported ────
let FlashMessage: any = null;
if (Platform.OS !== 'web') {
  try {
    FlashMessage = require('react-native-flash-message').default;
  } catch { /* not critical */ }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    RevenueCatService.initialize();
  }, []);

  return (
    <ErrorBoundary>
      <Provider store={store}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <RootNavigator />
            {FlashMessage ? <FlashMessage position="top" /> : null}
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Provider>
    </ErrorBoundary>
  );
}
