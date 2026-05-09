import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
  updateProfile,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { auth } from './firebase';

// Required for expo-auth-session Google flow on mobile
WebBrowser.maybeCompleteAuthSession();

// ── Email / Password ──────────────────────────────────────────────────────────

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

/**
 * Signs in with a Google ID token obtained from expo-auth-session.
 * Call this after a successful useAuthRequest response in the screen component.
 */
export async function signInWithGoogleCredential(idToken: string): Promise<User> {
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, googleCredential);
  return result.user;
}

// ── Session observer ─────────────────────────────────────────────────────────

export function subscribeToAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// Re-export Google hook config so screens don't need to import from two places
export { Google };
