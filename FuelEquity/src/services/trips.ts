import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  writeBatch,
  arrayUnion,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { TripDoc, RiderDoc } from '../types/firestore';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function createTrip(params: {
  ownerId: string;
  ownerDisplayName: string;
  name: string;
  origin: string;
  destination: string;
  date: string;
}): Promise<string> {
  const tripRef = doc(collection(db, 'trips'));
  const now = Timestamp.now();
  const inviteCode = generateInviteCode();

  const tripData: TripDoc = {
    id: tripRef.id,
    ownerId: params.ownerId,
    ownerDisplayName: params.ownerDisplayName,
    name: params.name,
    origin: params.origin,
    destination: params.destination,
    date: params.date,
    inviteCode,
    status: 'active',
    riderIds: [params.ownerId],
    totalCost: 0,
    totalMiles: 0,
    co2SavedKg: 0,
    createdAt: now,
    updatedAt: now,
  };

  const riderData: RiderDoc = {
    userId: params.ownerId,
    displayName: params.ownerDisplayName,
    role: 'driver',
    status: 'active',
    joinedAt: now,
    amountOwed: 0,
    amountPaid: 0,
  };

  const batch = writeBatch(db);
  batch.set(tripRef, tripData);
  batch.set(doc(db, 'trips', tripRef.id, 'riders', params.ownerId), riderData);
  await batch.commit();

  return tripRef.id;
}

export async function getTripByInviteCode(
  code: string,
): Promise<{ id: string; data: TripDoc } | null> {
  const snap = await getDocs(
    query(collection(db, 'trips'), where('inviteCode', '==', code.toUpperCase())),
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() as TripDoc };
}

export async function joinTrip(
  tripId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  const now = Timestamp.now();
  const batch = writeBatch(db);

  batch.update(doc(db, 'trips', tripId), {
    riderIds: arrayUnion(userId),
    updatedAt: now,
  });

  batch.set(doc(db, 'trips', tripId, 'riders', userId), {
    userId,
    displayName,
    role: 'passenger',
    status: 'active',
    joinedAt: now,
    amountOwed: 0,
    amountPaid: 0,
  } satisfies RiderDoc);

  await batch.commit();
}

export function subscribeToActiveTrip(
  userId: string,
  callback: (trip: TripDoc | null, id: string | null) => void,
): () => void {
  // Single-field array-contains query — no composite index required.
  // Status + sort are applied client-side until the composite index is deployed.
  const q = query(
    collection(db, 'trips'),
    where('riderIds', 'array-contains', userId),
    limit(20),
  );
  return onSnapshot(q, (snap) => {
    const active = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as TripDoc }))
      .filter((t) => t.data.status === 'active')
      .sort((a, b) => b.data.createdAt.toMillis() - a.data.createdAt.toMillis());

    if (active.length > 0) {
      callback(active[0].data, active[0].id);
    } else {
      callback(null, null);
    }
  });
}

export function subscribeToRiders(
  tripId: string,
  callback: (riders: RiderDoc[]) => void,
): () => void {
  return onSnapshot(collection(db, 'trips', tripId, 'riders'), (snap) => {
    callback(snap.docs.map((d) => d.data() as RiderDoc));
  });
}
