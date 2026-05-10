import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { Colors } from './src/theme';
import { initAuthListener, useAuthStore } from './src/store/authStore';
import AuthNavigator from './src/screens/auth/AuthNavigator';
import MainNavigator from './src/screens/main/MainNavigator';
import type { MainTabParamList } from './src/screens/main/types';

export const navigationRef = createNavigationContainerRef<MainTabParamList>();

const linking: LinkingOptions<MainTabParamList> = {
  prefixes: ['fuelequity://'],
  config: {
    screens: {
      Home: {
        screens: {
          JoinTrip: 'join/:code',
        },
      },
    },
  },
};

// Maps FCM notification type → tab to open when notification is tapped
function getTabForNotificationType(type: string): keyof MainTabParamList | null {
  switch (type) {
    case 'new_expense':
    case 'payment_request':
    case 'payment_received':
    case 'payment_reminder':
      return 'Splits';
    default:
      return null;
  }
}

export default function App() {
  const { user, loading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  // Notification handlers temporarily disabled: expo-notifications not supported in Expo Go on SDK 53+
  // Will re-enable with development build
  useEffect(() => {
    return () => {};
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          linking={linking}
          theme={{
            dark: true,
            colors: {
              primary: Colors.primary,
              background: Colors.background,
              card: Colors.surface,
              text: Colors.textPrimary,
              border: Colors.border,
              notification: Colors.primary,
            },
            fonts: {
              regular: { fontFamily: 'System', fontWeight: '400' },
              medium: { fontFamily: 'System', fontWeight: '500' },
              bold: { fontFamily: 'System', fontWeight: '700' },
              heavy: { fontFamily: 'System', fontWeight: '800' },
            },
          }}
        >
          <StatusBar style="light" backgroundColor={Colors.background} />
          {user ? (
            <MainNavigator />
          ) : (
            <AuthNavigator />
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
