import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'dev';

const devConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_DEV_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_DEV_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_DEV_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_DEV_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_DEV_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_DEV_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_DEV_MEASUREMENT_ID,
};

const prodConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_PROD_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_PROD_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROD_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_PROD_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_PROD_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_PROD_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_PROD_MEASUREMENT_ID,
};

const firebaseConfig = ENV === 'prod' ? prodConfig : devConfig;

let app: FirebaseApp;
let auth: Auth;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} else {
  app = getApps()[0];
  auth = getAuth(app);
}

export { auth, app };
export const db = getFirestore(app);

// FCM: use @react-native-firebase/messaging for native push notifications
