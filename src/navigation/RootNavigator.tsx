import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Colors } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

// Screens
import { DashboardScreen } from '@/screens/DashboardScreen';
import { ContractsScreen } from '@/screens/ContractsScreen';
import { ContractDetailScreen } from '@/screens/ContractDetailScreen';
import { BidWriterScreen } from '@/screens/BidWriterScreen';
import { JobsScreen } from '@/screens/JobsScreen';
import { CrewScreen } from '@/screens/CrewScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { InvoiceScreen } from '@/screens/InvoiceScreen';
import { AdminScreen } from '@/screens/AdminScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, any> = {
            Dashboard: 'grid-outline',
            Contracts: 'document-text-outline',
            Jobs: 'briefcase-outline',
            Crew: 'people-outline',
            Admin: 'shield-outline',
          };
          return <Ionicons name={icons[route.name] || 'grid-outline'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Contracts" component={ContractsScreen} />
      <Tab.Screen name="Jobs" component={JobsScreen} />
      <Tab.Screen name="Crew" component={CrewScreen} />
      <Tab.Screen name="Admin" component={AdminScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user } = useSelector((s: RootState) => s.auth);

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: Colors.accent,
          background: Colors.bg,
          card: Colors.surface,
          text: Colors.text,
          border: Colors.border,
          notification: Colors.accent,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen name="ContractDetail" component={ContractDetailScreen} />
            <Stack.Screen name="BidWriter" component={BidWriterScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Paywall" component={PaywallScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Invoice" component={InvoiceScreen} options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
