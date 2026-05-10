import { doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';

async function getDevicePushToken(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device');
    if (!Device.isDevice) return null;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications');

    if (Platform.OS === 'android') {
      await Promise.all([
        Notifications.setNotificationChannelAsync('payment_requests', {
          name: 'Payment Requests',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        }),
        Notifications.setNotificationChannelAsync('new_expense', {
          name: 'New Expenses',
          importance: Notifications.AndroidImportance.DEFAULT,
        }),
        Notifications.setNotificationChannelAsync('payment_received', {
          name: 'Payment Received',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        }),
      ]);
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    const finalStatus =
      existingStatus === 'granted'
        ? existingStatus
        : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') return null;

    // Raw FCM (Android) / APNS (iOS) token — usable by Firebase Admin SDK directly
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return (tokenData?.data as string) ?? null;
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(userId: string): Promise<void> {
  // Temporarily disabled: expo-notifications not supported in Expo Go on SDK 53+
  // Will re-enable with development build
  return;
}
