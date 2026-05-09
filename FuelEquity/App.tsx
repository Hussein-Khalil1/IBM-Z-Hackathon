import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { Colors } from './src/theme';
import { initAuthListener, useAuthStore } from './src/store/authStore';
import { registerForPushNotifications } from './src/services/notifications';
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
  const notificationListener = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      registerForPushNotifications(user.uid);
    }
  }, [user]);

  // Handle notification taps (foreground, background, and cold start)
  useEffect(() => {
    let responseSub: { remove: () => void } | null = null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications');

      // Show alerts for foreground notifications
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Navigate when user taps a notification
      responseSub = Notifications.addNotificationResponseReceivedListener(
        (response: { notification: { request: { content: { data: Record<string, string> } } } }) => {
          const data = response.notification.request.content.data;
          const tab = getTabForNotificationType(data?.type ?? '');
          if (tab && navigationRef.isReady()) {
            navigationRef.navigate(tab);
          }
        },
      );

      // Handle cold-start: app opened by tapping a notification
      Notifications.getLastNotificationResponseAsync().then(
        (response: { notification: { request: { content: { data: Record<string, string> } } } } | null) => {
          if (!response) return;
          const data = response.notification.request.content.data;
          const tab = getTabForNotificationType(data?.type ?? '');
          if (tab) {
            // Defer until navigator is mounted
            const check = setInterval(() => {
              if (navigationRef.isReady()) {
                clearInterval(check);
                navigationRef.navigate(tab);
              }
            }, 100);
            notificationListener.current = check as unknown as ReturnType<typeof setTimeout>;
          }
        },
      );
    } catch {
      // expo-notifications not available (Expo Go / simulator) — silently skip
    }

    return () => {
      responseSub?.remove();
      if (notificationListener.current) clearInterval(notificationListener.current as unknown as NodeJS.Timeout);
    };
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
        <StripeProvider
          publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
          merchantIdentifier="merchant.com.fuelequity"
          urlScheme="fuelequity"
        >
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
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
