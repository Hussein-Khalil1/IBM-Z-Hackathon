import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { app, db } from './firebase';
import type { PaymentRequestDoc } from '../types/firestore';

const functions = getFunctions(app);

export async function requestPayment(
  tripId: string,
  riderId: string,
): Promise<{ paymentRequestId: string; clientSecret: string; amount: number }> {
  const fn = httpsCallable<
    { tripId: string; riderId: string },
    { paymentRequestId: string; clientSecret: string; amount: number }
  >(functions, 'requestPayment');
  const result = await fn({ tripId, riderId });
  return result.data;
}

export async function confirmPayment(
  tripId: string,
  paymentRequestId: string,
): Promise<void> {
  const fn = httpsCallable<
    { tripId: string; paymentRequestId: string },
    { success: boolean }
  >(functions, 'confirmPayment');
  await fn({ tripId, paymentRequestId });
}

export async function sendPaymentReminder(
  tripId: string,
  riderId: string,
): Promise<{ sent: boolean }> {
  const fn = httpsCallable<
    { tripId: string; riderId: string },
    { sent: boolean }
  >(functions, 'sendPaymentReminder');
  const result = await fn({ tripId, riderId });
  return result.data;
}

export function subscribeToPaymentRequests(
  tripId: string,
  riderId: string,
  callback: (requests: PaymentRequestDoc[]) => void,
): () => void {
  const q = query(
    collection(db, 'trips', tripId, 'paymentRequests'),
    where('riderId', '==', riderId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => d.data() as PaymentRequestDoc)),
  );
}
