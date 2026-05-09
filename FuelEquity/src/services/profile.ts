import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { UserDoc } from '../types/firestore';

export async function getUserProfile(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

export async function upsertUserProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}
