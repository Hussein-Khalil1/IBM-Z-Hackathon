import { Timestamp, GeoPoint } from 'firebase/firestore';

// /users/{userId}
export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp;
  greenMilesTotal: number;
  notificationsEnabled?: boolean;
  currency?: string;
  vehicle?: {
    make: string;
    model: string;
    year: number;
    fuelType: 'gas' | 'electric' | 'hybrid';
    mpg: number;
    fuelEfficiencyL100km?: number;
  };
}

// /trips/{tripId}
export interface TripDoc {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  name: string;
  description?: string;
  origin: string;
  destination: string;
  date: string;
  inviteCode: string;
  status: 'active' | 'completed' | 'archived';
  riderIds: string[];
  totalCost: number;
  totalMiles: number;
  co2SavedKg: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

// /trips/{tripId}/expenses/{expenseId}
export interface ExpenseDoc {
  id: string;
  tripId: string;
  addedByUserId: string;
  category: 'gas' | 'toll' | 'parking' | 'other';
  amount: number;
  description?: string;
  splitType: 'equal' | 'custom';
  splits: Record<string, number>;
  receiptUrl?: string;
  createdAt: Timestamp;
}

// /trips/{tripId}/riders/{userId}
export interface RiderDoc {
  userId: string;
  displayName: string;
  role: 'driver' | 'passenger';
  status: 'invited' | 'active' | 'left';
  joinedAt: Timestamp;
  amountOwed: number;
  amountPaid: number;
}

// /greenMiles/{recordId}
export interface GreenMilesDoc {
  id: string;
  userId: string;
  tripId: string;
  milesShared: number;
  co2SavedKg: number;
  pointsEarned: number;
  createdAt: Timestamp;
}

// /gasReports/{reportId}
export interface GasReportDoc {
  id: string;
  reportedByUserId: string;
  stationName: string;
  address: string;
  location: GeoPoint;
  pricePerGallon: number;
  fuelType: 'regular' | 'midgrade' | 'premium' | 'diesel';
  upvotes: number;
  downvotes: number;
  createdAt: Timestamp;
}
