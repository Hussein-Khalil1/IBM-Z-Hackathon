import {
  collection,
  doc,
  writeBatch,
  increment,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ExpenseDoc } from '../types/firestore';

export async function addExpense(params: {
  tripId: string;
  addedByUserId: string;
  category: ExpenseDoc['category'];
  amount: number;
  description?: string;
  riderIds: string[];
}): Promise<void> {
  const { tripId, addedByUserId, category, amount, description, riderIds } = params;
  const perPerson = amount / riderIds.length;
  const now = Timestamp.now();

  const expenseRef = doc(collection(db, 'trips', tripId, 'expenses'));
  const splits: Record<string, number> = {};
  riderIds.forEach((id) => {
    splits[id] = perPerson;
  });

  const expenseData: ExpenseDoc = {
    id: expenseRef.id,
    tripId,
    addedByUserId,
    category,
    amount,
    ...(description ? { description } : {}),
    splitType: 'equal',
    splits,
    createdAt: now,
  };

  const batch = writeBatch(db);
  batch.set(expenseRef, expenseData);
  batch.update(doc(db, 'trips', tripId), {
    totalCost: increment(amount),
    updatedAt: now,
  });
  riderIds.forEach((riderId) => {
    batch.update(doc(db, 'trips', tripId, 'riders', riderId), {
      amountOwed: increment(perPerson),
    });
  });

  await batch.commit();
}

export function subscribeToExpenses(
  tripId: string,
  callback: (expenses: ExpenseDoc[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'trips', tripId, 'expenses'), orderBy('createdAt', 'desc')),
    (snap) => callback(snap.docs.map((d) => d.data() as ExpenseDoc)),
  );
}
