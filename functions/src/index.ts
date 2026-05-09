import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import Anthropic from '@anthropic-ai/sdk';
import Stripe from 'stripe';

admin.initializeApp();

type Category = 'gas' | 'toll' | 'parking' | 'other';

interface ScanReceiptRequest {
  imageBase64: string;
  mimeType: string;
}

interface ScanReceiptResponse {
  merchantName: string;
  amount: number;
  category: Category;
}

const VALID_CATEGORIES: Category[] = ['gas', 'toll', 'parking', 'other'];

// ─── FCM helper ───────────────────────────────────────────────────────────────
// Checks master toggle + per-type pref before sending. Silently skips stale tokens.

async function sendIfAllowed(
  db: admin.firestore.Firestore,
  userId: string,
  prefKey: string,
  message: Omit<admin.messaging.Message, 'token'>,
): Promise<void> {
  const userSnap = await db.doc(`users/${userId}`).get();
  const userData = userSnap.data();
  if (!userData) return;
  if (userData.notificationsEnabled === false) return;
  const prefs = userData.notificationPreferences as Record<string, boolean> | undefined;
  if (prefs?.[prefKey] === false) return;
  const token = userData.fcmToken as string | undefined;
  if (!token) return;
  await admin.messaging().send({ ...message, token }).catch(() => {});
}

// ─── Receipt scanner ──────────────────────────────────────────────────────────

export const scanReceipt = onCall(
  { secrets: ['ANTHROPIC_API_KEY'] },
  async (request): Promise<ScanReceiptResponse> => {
    const { imageBase64, mimeType } = request.data as ScanReceiptRequest;

    if (!imageBase64 || !mimeType) {
      throw new HttpsError('invalid-argument', 'imageBase64 and mimeType are required');
    }

    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
    type ValidMime = typeof validMimeTypes[number];
    if (!validMimeTypes.includes(mimeType as ValidMime)) {
      throw new HttpsError('invalid-argument', 'Unsupported image type');
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let text = '';
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as ValidMime,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Extract data from this receipt and respond with ONLY valid JSON, no markdown:
{
  "merchantName": "store or restaurant name (max 40 chars, empty string if unclear)",
  "amount": total amount as a number (e.g. 45.50),
  "category": one of exactly: "gas", "toll", "parking", "other"
}

Category rules: gas=fuel station, toll=highway/bridge toll, parking=parking lot/garage, other=everything else.
If a field cannot be determined: merchantName="", amount=0, category="other".`,
              },
            ],
          },
        ],
      });
      text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    } catch {
      throw new HttpsError('internal', 'AI service unavailable');
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no json');
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ScanReceiptResponse>;
      return {
        merchantName: String(parsed.merchantName ?? '').slice(0, 40),
        amount: Math.max(0, Number(parsed.amount) || 0),
        category: VALID_CATEGORIES.includes(parsed.category as Category)
          ? (parsed.category as Category)
          : 'other',
      };
    } catch {
      throw new HttpsError('internal', 'Failed to parse receipt data');
    }
  },
);

// ─── Request payment ──────────────────────────────────────────────────────────

interface RequestPaymentRequest {
  tripId: string;
  riderId: string;
}

interface RequestPaymentResponse {
  paymentRequestId: string;
  clientSecret: string;
  amount: number;
}

export const requestPayment = onCall(
  { secrets: ['STRIPE_SECRET_KEY'] },
  async (request): Promise<RequestPaymentResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const { tripId, riderId } = request.data as RequestPaymentRequest;
    const driverId = request.auth.uid;
    const db = admin.firestore();

    const [tripSnap, riderSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.doc(`trips/${tripId}/riders/${riderId}`).get(),
    ]);

    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found');
    if (!riderSnap.exists) throw new HttpsError('not-found', 'Rider not found');

    const trip = tripSnap.data()!;
    if (trip.ownerId !== driverId) throw new HttpsError('permission-denied', 'Driver only');

    const rider = riderSnap.data()!;
    const balance = Math.max(0, (rider.amountOwed ?? 0) - (rider.amountPaid ?? 0));
    if (balance < 0.5) throw new HttpsError('failed-precondition', 'Balance too small to charge');

    const amountCents = Math.round(balance * 100);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { tripId, riderId, driverId, tripName: trip.name },
    });

    const prRef = db.collection(`trips/${tripId}/paymentRequests`).doc();
    const batch = db.batch();

    batch.set(prRef, {
      requestId: prRef.id,
      tripId,
      driverId,
      riderId,
      amount: balance,
      amountCents,
      currency: 'usd',
      status: 'pending',
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(db.doc(`trips/${tripId}/riders/${riderId}`), {
      paymentStatus: 'requested',
    });

    await batch.commit();

    await sendIfAllowed(db, riderId, 'paymentRequested', {
      notification: {
        title: 'Payment requested',
        body: `${trip.ownerDisplayName} is requesting $${balance.toFixed(2)} for "${trip.name}"`,
      },
      data: { type: 'payment_request', tripId, paymentRequestId: prRef.id },
      android: { priority: 'high' as const, notification: { channelId: 'payment_requests' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });

    return {
      paymentRequestId: prRef.id,
      clientSecret: paymentIntent.client_secret!,
      amount: balance,
    };
  },
);

// ─── Confirm payment ──────────────────────────────────────────────────────────

interface ConfirmPaymentRequest {
  tripId: string;
  paymentRequestId: string;
}

export const confirmPayment = onCall(
  { secrets: ['STRIPE_SECRET_KEY'] },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const { tripId, paymentRequestId } = request.data as ConfirmPaymentRequest;
    const riderId = request.auth.uid;
    const db = admin.firestore();

    const prSnap = await db.doc(`trips/${tripId}/paymentRequests/${paymentRequestId}`).get();
    if (!prSnap.exists) throw new HttpsError('not-found', 'Payment request not found');

    const pr = prSnap.data()!;
    if (pr.riderId !== riderId) throw new HttpsError('permission-denied', 'Not your payment');
    if (pr.status === 'paid') return { success: true }; // idempotent

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const pi = await stripe.paymentIntents.retrieve(pr.paymentIntentId as string);

    if (pi.status !== 'succeeded') {
      throw new HttpsError('failed-precondition', 'Payment not yet confirmed by Stripe');
    }

    const batch = db.batch();
    batch.update(prSnap.ref, {
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(db.doc(`trips/${tripId}/riders/${riderId}`), {
      amountPaid: admin.firestore.FieldValue.increment(pr.amount as number),
      paymentStatus: 'paid',
    });
    await batch.commit();

    // Notify driver that their rider paid
    const [tripSnap, riderSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.doc(`trips/${tripId}/riders/${riderId}`).get(),
    ]);
    const trip = tripSnap.data();
    const riderName = (riderSnap.data()?.displayName as string) ?? 'A rider';
    const driverId = pr.driverId as string;

    if (trip) {
      await sendIfAllowed(db, driverId, 'paymentReceived', {
        notification: {
          title: 'Payment received',
          body: `${riderName} paid $${(pr.amount as number).toFixed(2)} for "${trip.name}"`,
        },
        data: { type: 'payment_received', tripId },
        android: { priority: 'high' as const, notification: { channelId: 'payment_received' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    }

    return { success: true };
  },
);

// ─── New expense trigger ──────────────────────────────────────────────────────
// Notifies all riders (except who added it) when a new expense is created.

export const onExpenseCreated = onDocumentCreated(
  'trips/{tripId}/expenses/{expenseId}',
  async (event) => {
    const expense = event.data?.data();
    if (!expense) return;

    const db = admin.firestore();
    const { tripId } = event.params;
    const addedByUserId = expense.addedByUserId as string;

    const [tripSnap, ridersSnap, adderSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.collection(`trips/${tripId}/riders`).get(),
      db.doc(`trips/${tripId}/riders/${addedByUserId}`).get(),
    ]);

    if (!tripSnap.exists) return;
    const trip = tripSnap.data()!;
    const adderName = (adderSnap.data()?.displayName as string) ?? 'Someone';
    const amount = (expense.amount as number).toFixed(2);
    const category = expense.category as string;

    await Promise.allSettled(
      ridersSnap.docs
        .filter((d) => d.id !== addedByUserId)
        .map((d) =>
          sendIfAllowed(db, d.id, 'newExpense', {
            notification: {
              title: `New expense on "${trip.name}"`,
              body: `${adderName} added a $${amount} ${category} expense`,
            },
            data: { type: 'new_expense', tripId },
            android: { priority: 'high' as const, notification: { channelId: 'new_expense' } },
            apns: { payload: { aps: { sound: 'default' } } },
          }),
        ),
    );
  },
);

// ─── Send payment reminder ────────────────────────────────────────────────────

interface SendReminderRequest {
  tripId: string;
  riderId: string;
}

export const sendPaymentReminder = onCall(
  {},
  async (request): Promise<{ sent: boolean }> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const { tripId, riderId } = request.data as SendReminderRequest;
    const driverId = request.auth.uid;
    const db = admin.firestore();

    const [tripSnap, riderSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.doc(`trips/${tripId}/riders/${riderId}`).get(),
    ]);

    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found');
    const trip = tripSnap.data()!;
    if (trip.ownerId !== driverId) throw new HttpsError('permission-denied', 'Driver only');
    if (!riderSnap.exists) throw new HttpsError('not-found', 'Rider not found');

    const riderData = riderSnap.data()!;
    const balance = Math.max(0, (riderData.amountOwed ?? 0) - (riderData.amountPaid ?? 0));

    await sendIfAllowed(db, riderId, 'reminder', {
      notification: {
        title: 'Friendly payment reminder',
        body: `${trip.ownerDisplayName} is waiting for your $${balance.toFixed(2)} payment on "${trip.name}"`,
      },
      data: { type: 'payment_reminder', tripId },
      android: { priority: 'high' as const, notification: { channelId: 'payment_requests' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });

    return { sent: true };
  },
);
