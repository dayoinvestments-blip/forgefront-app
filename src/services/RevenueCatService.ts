/**
 * RevenueCatService
 *
 * On iOS/Android: uses the real react-native-purchases SDK.
 * On Web (Netlify PWA): falls back to a no-op stub so the web build
 * doesn't crash trying to import a native module.
 *
 * react-native-purchases is in optionalDependencies and excluded from
 * the Netlify build via --omit=optional in netlify.toml.
 */
import { Platform } from 'react-native';
import { store, setSubscription, clearSubscription } from '@/store';

const RC_IOS_KEY     = process.env.EXPO_PUBLIC_RC_IOS_KEY     || 'appl_REPLACE_WITH_YOUR_KEY';
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || 'goog_REPLACE_WITH_YOUR_KEY';

export const ENTITLEMENTS = {
  BASE: 'base_access',
  PRO:  'pro_access',
};

export const PRODUCT_IDS = {
  BASE_MONTHLY: 'forgefront_base_monthly',
  PRO_MONTHLY:  'forgefront_pro_monthly',
  PRO_ANNUAL:   'forgefront_pro_annual',
};

// ─── Type stubs so TypeScript compiles on web ─────────────────────────────────
export interface PurchasesPackage {
  identifier: string;
  product: { priceString: string; description: string };
}

// ─── Service ──────────────────────────────────────────────────────────────────
export class RevenueCatService {
  static async initialize() {
    if (Platform.OS === 'web') return; // no-op on web
    try {
      // Dynamic import so Metro web bundler never includes the native module
      const Purchases = (await import('react-native-purchases')).default;
      if (__DEV__) {
        const { LOG_LEVEL } = await import('react-native-purchases');
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }
      const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
      await Purchases.configure({ apiKey });
      Purchases.addCustomerInfoUpdateListener(RevenueCatService._handleInfo);
    } catch (e) {
      console.warn('[RevenueCat] Native module not available:', e);
    }
  }

  static _handleInfo(info: any) {
    const hasPro  = info?.entitlements?.active?.[ENTITLEMENTS.PRO]  !== undefined;
    const hasBase = info?.entitlements?.active?.[ENTITLEMENTS.BASE] !== undefined;
    if (hasPro) {
      store.dispatch(setSubscription({
        tier: 'pro', isActive: true,
        expiresAt: info.entitlements.active[ENTITLEMENTS.PRO].expirationDate,
      }));
    } else if (hasBase) {
      store.dispatch(setSubscription({
        tier: 'base', isActive: true,
        expiresAt: info.entitlements.active[ENTITLEMENTS.BASE].expirationDate,
      }));
    } else {
      store.dispatch(clearSubscription());
    }
  }

  static async getOfferings(): Promise<PurchasesPackage[]> {
    if (Platform.OS === 'web') return [];
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const offerings = await Purchases.getOfferings();
      return offerings.current?.availablePackages ?? [];
    } catch { return []; }
  }

  static async purchasePackage(pkg: PurchasesPackage): Promise<{ success: boolean; cancelled?: boolean }> {
    if (Platform.OS === 'web') return { success: false };
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const { customerInfo } = await Purchases.purchasePackage(pkg as any);
      RevenueCatService._handleInfo(customerInfo);
      return { success: true };
    } catch (e: any) {
      if (!e.userCancelled) console.error('Purchase error:', e);
      return { success: false, cancelled: e.userCancelled };
    }
  }

  static async restorePurchases(): Promise<{ success: boolean }> {
    if (Platform.OS === 'web') return { success: false };
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const customerInfo = await Purchases.restorePurchases();
      RevenueCatService._handleInfo(customerInfo);
      return { success: true };
    } catch { return { success: false }; }
  }

  static async getCustomerInfo(): Promise<any | null> {
    if (Platform.OS === 'web') return null;
    try {
      const Purchases = (await import('react-native-purchases')).default;
      return await Purchases.getCustomerInfo();
    } catch { return null; }
  }
}
