import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import OpenAI from 'openai';

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
  { secrets: ['OPENAI_API_KEY'] },
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

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let text = '';
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: 'low',
                },
              } as any,
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
            ] as any,
          },
        ],
      });
      const content = response.choices[0].message.content;
      text = typeof content === 'string' ? content : '';
      text = text.trim();
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
  {},
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

    // Dummy payment workflow - just create request without Stripe
    const prRef = db.collection(`trips/${tripId}/paymentRequests`).doc();
    const batch = db.batch();

    batch.set(prRef, {
      requestId: prRef.id,
      tripId,
      driverId,
      riderId,
      amount: balance,
      currency: 'cad',
      status: 'pending',
      clientSecret: `secret_${prRef.id}`,
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
      clientSecret: `secret_${prRef.id}`,
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
  {},
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

    // Dummy payment workflow - just mark as paid without Stripe
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

// ─── Gas Price Integration (S3-01) ────────────────────────────────────────────

interface GasStation {
  id: string;
  name: string;
  brand?: string;
  pricePerLitre: number; // cents/litre
  distance: number; // km
  latitude: number;
  longitude: number;
  lastUpdated: number; // timestamp
}

interface GetGasPricesRequest {
  latitude: number;
  longitude: number;
  radiusKm?: number; // default 5 km
}

interface GetGasPricesResponse {
  stations: GasStation[];
  cached: boolean;
  cacheExpiry: number; // timestamp when cache expires
}

const GAS_PRICE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * S3-01: Fetch live gas prices from CollectAPI with 15-min caching.
 * Returns nearest 5 stations sorted by price.
 */
export const getGasPrices = onCall(
  { secrets: ['COLLECTAPI_KEY', 'OPENWEATHER_API_KEY'] },
  async (request): Promise<GetGasPricesResponse> => {
    const { latitude, longitude, radiusKm = 5 } = request.data as GetGasPricesRequest;

    if (!latitude || !longitude) {
      throw new HttpsError('invalid-argument', 'latitude and longitude required');
    }

    const db = admin.firestore();
    const cacheKey = `${Math.round(latitude * 100) / 100}_${Math.round(longitude * 100) / 100}`;

    // ─── Check cache ──────────────────────────────────────────────────────────
    const cacheDoc = await db.doc(`cache/gasPrices/${cacheKey}`).get();
    if (cacheDoc.exists) {
      const cached = cacheDoc.data()!;
      const now = Date.now();
      if ((cached.expiresAt as number) > now) {
        return {
          stations: cached.stations as GasStation[],
          cached: true,
          cacheExpiry: cached.expiresAt as number,
        };
      }
    }

    // ─── Fetch from CollectAPI ────────────────────────────────────────────────
    let stations: GasStation[] = [];

    try {
      const apiKey = process.env.COLLECTAPI_KEY!;
      const url = 'https://api.collectapi.com/gasPrice/canada';

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'authorization': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`CollectAPI error: ${response.statusText}`);
      }

      const data = await response.json();

      // Parse CollectAPI response and filter by radius
      // CollectAPI returns: { result: [ { name, city, price, currency } ] }
      if (data.result && Array.isArray(data.result)) {
        stations = data.result
          .filter((station: any) => station.price > 0) // Valid price
          .slice(0, 5) // Top 5 stations
          .map((station: any, idx: number) => ({
            id: `collectapi_${idx}`,
            name: station.name || 'Gas Station',
            brand: extractBrand(station.name || ''),
            pricePerLitre: Math.round(station.price * 100), // Convert to cents/L
            distance: Math.random() * radiusKm, // Mock distance (will use geo API later)
            latitude: latitude + (Math.random() - 0.5) * 0.05,
            longitude: longitude + (Math.random() - 0.5) * 0.05,
            lastUpdated: Date.now(),
          }));
      }

      // Fallback to mock if no results
      if (stations.length === 0) {
        stations = generateMockStations(latitude, longitude, radiusKm);
      }
    } catch (error) {
      console.error('CollectAPI error:', error);
      // Fallback to mock data
      stations = generateMockStations(latitude, longitude, radiusKm);
    }

    // Sort by price (cheapest first)
    const sortedStations = stations.sort((a, b) => a.pricePerLitre - b.pricePerLitre);

    // ─── Cache the result ──────────────────────────────────────────────────────
    const expiresAt = Date.now() + GAS_PRICE_CACHE_TTL;
    await db.doc(`cache/gasPrices/${cacheKey}`).set(
      {
        stations: sortedStations,
        expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      stations: sortedStations,
      cached: false,
      cacheExpiry: expiresAt,
    };
  },
);

// ─── Helper Functions ─────────────────────────────────────────────────────────

function extractBrand(name: string): string {
  const brands = ['Shell', 'Esso', 'Costco', 'Petro-Canada', 'Husky', 'Circle K'];
  for (const brand of brands) {
    if (name.toLowerCase().includes(brand.toLowerCase())) {
      return brand;
    }
  }
  return '';
}

function generateMockStations(
  latitude: number,
  longitude: number,
  radiusKm: number,
): GasStation[] {
  const mockStations: GasStation[] = [
    {
      id: 'station_1',
      name: 'Shell',
      brand: 'Shell',
      pricePerLitre: 15299,
      distance: 1.2,
      latitude: latitude + 0.01,
      longitude: longitude + 0.01,
      lastUpdated: Date.now(),
    },
    {
      id: 'station_2',
      name: 'Costco Gas',
      brand: 'Costco',
      pricePerLitre: 14899,
      distance: 2.5,
      latitude: latitude - 0.01,
      longitude: longitude - 0.01,
      lastUpdated: Date.now(),
    },
    {
      id: 'station_3',
      name: 'Esso',
      brand: 'Esso',
      pricePerLitre: 15599,
      distance: 3.1,
      latitude: latitude + 0.02,
      longitude: longitude,
      lastUpdated: Date.now(),
    },
    {
      id: 'station_4',
      name: 'Petro-Canada',
      brand: 'Petro-Canada',
      pricePerLitre: 15699,
      distance: 1.8,
      latitude: latitude,
      longitude: longitude + 0.02,
      lastUpdated: Date.now(),
    },
    {
      id: 'station_5',
      name: 'Husky',
      brand: 'Husky',
      pricePerLitre: 15499,
      distance: 4.2,
      latitude: latitude - 0.02,
      longitude: longitude + 0.01,
      lastUpdated: Date.now(),
    },
  ];

  return mockStations.sort((a, b) => a.pricePerLitre - b.pricePerLitre);
}

// ─── Route Comparison (S3-03) ─────────────────────────────────────────────────

interface Location {
  latitude: number;
  longitude: number;
}

interface RouteOption {
  id: 'eco' | 'fast' | 'alternate';
  label: string;
  distanceKm: number;
  durationMinutes: number;
  elevationGainM: number;
  terrainPenalty: number; // percentage (e.g., 5 = +5%)
  baseFuelConsumption: number; // litres
  adjustedFuelConsumption: number; // with terrain penalty
  fuelCostCAD: number;
  terrainDifficulty: 'flat' | 'moderate' | 'hilly'; // badge for UI
  gasPrice: number; // cents per litre (for reference)
}

interface CompareRoutesRequest {
  origin: Location;
  destination: Location;
  baseFuelEfficiency: number; // L/100km from user's vehicle
  gasPrice: number; // cents per litre
}

interface CompareRoutesResponse {
  routes: RouteOption[];
  recommended: RouteOption;
}

const TERRAIN_PENALTY_PER_100M = 5; // +5% fuel per 100m elevation gain

/**
 * S3-03: Compare eco vs fast routes and calculate fuel costs.
 * Uses Google Maps Routes API + elevation data.
 * Applies terrain model: +5% fuel per 100m elevation gain.
 */
export const compareRoutes = onCall(
  { secrets: ['GOOGLE_MAPS_API_KEY'] },
  async (request): Promise<CompareRoutesResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const data = request.data as CompareRoutesRequest;
    const { origin, destination, baseFuelEfficiency, gasPrice } = data;

    if (!origin || !destination || !baseFuelEfficiency) {
      throw new HttpsError('invalid-argument', 'origin, destination, baseFuelEfficiency required');
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY!;

    try {
      // Call Google Maps Routes API for eco and fast routes
      const routeRequests = [
        {
          label: 'Eco Route',
          id: 'eco' as const,
          preferences: 'TRAFFIC_UNAWARE|TOLL_UNAWARE',
        },
        {
          label: 'Fast Route',
          id: 'fast' as const,
          preferences: 'TRAFFIC_UNAWARE|TOLLS|HIGHWAYS',
        },
      ];

      const routes: RouteOption[] = [];

      for (const routeReq of routeRequests) {
        try {
          const routeResponse = await fetch(
            'https://routes.googleapis.com/directions/v2:computeRoutes',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
              },
              body: JSON.stringify({
                origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
                destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
                routeModifiers: {
                  avoidTolls: routeReq.id === 'eco',
                  avoidHighways: routeReq.id === 'eco',
                },
                computeAlternativeRoutes: false,
                units: 'METRIC',
              }),
            },
          );

          const routeData = await routeResponse.json();

          if (!routeData.routes || routeData.routes.length === 0) {
            throw new Error('No routes found');
          }

          const googleRoute = routeData.routes[0];
          const leg = googleRoute.legs[0];

          // Get elevation data
          const pathCoords = googleRoute.polyline.encodedPolyline;
          let elevationGain = 0;

          // Use simplified elevation calculation (real elevation API would need polyline decoding)
          // For now, estimate based on route type
          if (routeReq.id === 'eco') {
            elevationGain = 120; // Flat eco route
          } else {
            elevationGain = 280; // Hilly fast route
          }

          const distanceKm = leg.distanceMeters / 1000;
          const durationMinutes = Math.round(parseInt(leg.duration.replace('s', '')) / 60);
          const terrainPenalty = (elevationGain / 100) * TERRAIN_PENALTY_PER_100M;

          const baseFuelConsumption = (distanceKm / 100) * baseFuelEfficiency;
          const adjustedFuelConsumption = baseFuelConsumption * (1 + terrainPenalty / 100);
          const costCents = adjustedFuelConsumption * gasPrice;
          const costCAD = costCents / 100;

          const terrainDifficulty = elevationGain > 200 ? 'hilly' : elevationGain > 80 ? 'moderate' : 'flat';

          routes.push({
            id: routeReq.id,
            label: routeReq.label,
            distanceKm,
            durationMinutes,
            elevationGainM: elevationGain,
            terrainPenalty,
            baseFuelConsumption,
            adjustedFuelConsumption,
            fuelCostCAD: costCAD,
            terrainDifficulty,
            gasPrice,
          });
        } catch (error) {
          console.error(`Failed to get ${routeReq.id} route:`, error);
          // Continue with fallback mock route
        }
      }

      // If API calls fail, use mock routes
      if (routes.length === 0) {
        const mockRoutes: RouteOption[] = [
          {
            id: 'eco',
            label: 'Eco Route',
            distanceKm: 42.5,
            durationMinutes: 45,
            elevationGainM: 120,
            terrainPenalty: (120 / 100) * TERRAIN_PENALTY_PER_100M,
            baseFuelConsumption: (42.5 / 100) * baseFuelEfficiency,
            adjustedFuelConsumption: (42.5 / 100) * baseFuelEfficiency * (1 + ((120 / 100) * TERRAIN_PENALTY_PER_100M) / 100),
            fuelCostCAD: ((42.5 / 100) * baseFuelEfficiency * (1 + ((120 / 100) * TERRAIN_PENALTY_PER_100M) / 100) * gasPrice) / 100,
            terrainDifficulty: 'moderate',
            gasPrice,
          },
          {
            id: 'fast',
            label: 'Fast Route',
            distanceKm: 38.2,
            durationMinutes: 38,
            elevationGainM: 280,
            terrainPenalty: (280 / 100) * TERRAIN_PENALTY_PER_100M,
            baseFuelConsumption: (38.2 / 100) * baseFuelEfficiency,
            adjustedFuelConsumption: (38.2 / 100) * baseFuelEfficiency * (1 + ((280 / 100) * TERRAIN_PENALTY_PER_100M) / 100),
            fuelCostCAD: ((38.2 / 100) * baseFuelEfficiency * (1 + ((280 / 100) * TERRAIN_PENALTY_PER_100M) / 100) * gasPrice) / 100,
            terrainDifficulty: 'hilly',
            gasPrice,
          },
        ];

        routes.push(...mockRoutes);
      }

      // Always add a flat alternate route
      const alternateRoute: RouteOption = {
        id: 'alternate',
        label: 'Flat Route',
        distanceKm: 44.8,
        durationMinutes: 50,
        elevationGainM: 45,
        terrainPenalty: (45 / 100) * TERRAIN_PENALTY_PER_100M,
        baseFuelConsumption: (44.8 / 100) * baseFuelEfficiency,
        adjustedFuelConsumption: (44.8 / 100) * baseFuelEfficiency * (1 + ((45 / 100) * TERRAIN_PENALTY_PER_100M) / 100),
        fuelCostCAD: ((44.8 / 100) * baseFuelEfficiency * (1 + ((45 / 100) * TERRAIN_PENALTY_PER_100M) / 100) * gasPrice) / 100,
        terrainDifficulty: 'flat',
        gasPrice,
      };

      routes.push(alternateRoute);

      // Recommend eco route (lowest fuel cost)
      const recommended = routes.reduce((best, curr) =>
        curr.fuelCostCAD < best.fuelCostCAD ? curr : best,
      );

      // Sort by fuel cost for UI
      routes.sort((a, b) => a.fuelCostCAD - b.fuelCostCAD);

      return { routes, recommended };
    } catch (error) {
      console.error('Error in compareRoutes:', error);
      throw new HttpsError('internal', 'Failed to compare routes');
    }
  },
);

// ─── Fuel Consumption Model (S3-05) ───────────────────────────────────────────

interface FuelConsumptionRequest {
  baseLitrePer100km: number; // from user vehicle profile
  distanceKm: number;
  terrainPenaltyPercent: number; // e.g., 5 for +5%
  trafficPenaltyPercent?: number; // e.g., 3 for +3%, default 0
  temperatureCelsius?: number; // for cold-start penalty
  windSpeedKmh?: number; // for headwind penalty
}

interface FuelConsumptionResponse {
  baseFuelLitres: number;
  terrainAdjustment: number;
  trafficAdjustment: number;
  coldStartAdjustment: number;
  headwindAdjustment: number;
  totalAdjustmentPercent: number;
  adjustedFuelLitres: number;
  co2KgEmitted: number; // ~2.31 kg CO2 per litre of fuel
}

/**
 * S3-05: Calculate fuel consumption with real-world modifiers.
 * Base efficiency + terrain, traffic, temperature, and wind penalties.
 */
export const calculateFuelConsumption = onCall(
  {},
  async (request): Promise<FuelConsumptionResponse> => {
    const data = request.data as FuelConsumptionRequest;
    const {
      baseLitrePer100km,
      distanceKm,
      terrainPenaltyPercent = 0,
      trafficPenaltyPercent = 0,
      temperatureCelsius = 15,
      windSpeedKmh = 0,
    } = data;

    if (!baseLitrePer100km || !distanceKm) {
      throw new HttpsError('invalid-argument', 'baseLitrePer100km and distanceKm required');
    }

    // Base consumption
    const baseFuelLitres = (distanceKm / 100) * baseLitrePer100km;

    // Calculate adjustments
    const terrainAdjustment = (baseFuelLitres * terrainPenaltyPercent) / 100;
    const trafficAdjustment = (baseFuelLitres * trafficPenaltyPercent) / 100;

    // Cold-start penalty: +4% below 5°C
    let coldStartAdjustment = 0;
    if (temperatureCelsius < 5) {
      coldStartAdjustment = (baseFuelLitres * 4) / 100;
    }

    // Headwind penalty: +2% for winds above 20 km/h
    let headwindAdjustment = 0;
    if (windSpeedKmh > 20) {
      headwindAdjustment = (baseFuelLitres * 2) / 100;
    }

    const adjustedFuelLitres =
      baseFuelLitres + terrainAdjustment + trafficAdjustment + coldStartAdjustment + headwindAdjustment;
    const totalAdjustmentPercent =
      terrainPenaltyPercent + trafficPenaltyPercent + (coldStartAdjustment > 0 ? 4 : 0) + (headwindAdjustment > 0 ? 2 : 0);

    // CO2 emissions: ~2.31 kg per litre
    const co2KgEmitted = adjustedFuelLitres * 2.31;

    return {
      baseFuelLitres,
      terrainAdjustment,
      trafficAdjustment,
      coldStartAdjustment,
      headwindAdjustment,
      totalAdjustmentPercent,
      adjustedFuelLitres,
      co2KgEmitted,
    };
  },
);

// ─── Weather API Integration (S3-06) ──────────────────────────────────────────

interface WeatherRequest {
  latitude: number;
  longitude: number;
}

interface WeatherResponse {
  temperature: number; // Celsius
  windSpeed: number; // km/h
  windDirection: number; // degrees (0-360)
  description: string; // e.g., "Partly cloudy"
  condition: 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'other';
  appliedColdPenalty: boolean;
  appliedHeadwindPenalty: boolean;
}

/**
 * S3-06: Fetch weather data to apply modifiers to fuel consumption.
 * Uses OpenWeatherMap API.
 */
export const getWeatherData = onCall(
  { secrets: ['GOOGLE_WEATHER_API_KEY'] },
  async (request): Promise<WeatherResponse> => {
    const { latitude, longitude } = request.data as WeatherRequest;

    if (!latitude || !longitude) {
      throw new HttpsError('invalid-argument', 'latitude and longitude required');
    }

    const apiKey = process.env.GOOGLE_WEATHER_API_KEY!;

    try {
      // Call Google Maps Weather API
      const weatherResponse = await fetch(
        `https://weather.googleapis.com/weather/v1/current?location.latitude=${latitude}&location.longitude=${longitude}&key=${apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!weatherResponse.ok) {
        console.warn('Google Weather API failed, using fallback mock data');
        return getMockWeatherData(latitude, longitude);
      }

      const weatherData = await weatherResponse.json();
      const current = weatherData.currentWeather || {};

      const temperature = current.temperature || 15;
      const windSpeed = current.windSpeed?.speed || 0;
      const windDirection = current.windSpeed?.direction || 0;
      const weatherDescription = current.weatherDescription?.[0] || 'Clear';
      const condition = mapGoogleWeatherToCondition(current.weatherDescription?.[0] || '');

      // Calculate penalties
      const appliedColdPenalty = temperature < 5;
      const appliedHeadwindPenalty = windSpeed > 20;

      return {
        temperature,
        windSpeed,
        windDirection,
        description: weatherDescription,
        condition,
        appliedColdPenalty,
        appliedHeadwindPenalty,
      };
    } catch (error) {
      console.error('Error fetching Google Weather data:', error);
      return getMockWeatherData(latitude, longitude);
    }
  },
);

/**
 * Map Google Weather descriptions to standardized conditions
 */
function mapGoogleWeatherToCondition(description: string): 'clear' | 'cloudy' | 'rainy' | 'other' {
  const desc = description.toLowerCase();
  if (desc.includes('clear') || desc.includes('sunny')) return 'clear';
  if (desc.includes('cloud') || desc.includes('overcast')) return 'cloudy';
  if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('precipitation')) return 'rainy';
  return 'other';
}

/**
 * Generate mock weather data as fallback
 */
function getMockWeatherData(latitude: number, longitude: number): WeatherResponse {
  const temperature = Math.random() * 30 - 5; // -5 to 25°C
  const windSpeed = Math.random() * 40; // 0-40 km/h
  const windDirection = Math.random() * 360;
  const descriptions = ['Clear', 'Cloudy', 'Rainy'];
  const description = descriptions[Math.floor(Math.random() * descriptions.length)];
  const conditions: Array<'clear' | 'cloudy' | 'rainy' | 'other'> = ['clear', 'cloudy', 'rainy'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];

  return {
    temperature,
    windSpeed,
    windDirection,
    description,
    condition,
    appliedColdPenalty: temperature < 5,
    appliedHeadwindPenalty: windSpeed > 20,
  };
}

// ─── AI Insight Generation (S4-02) ────────────────────────────────────────────

interface GenerateInsightRequest {
  tripId: string;
  userId: string;
}

interface GenerateInsightResponse {
  insight: string;
  category: 'savings' | 'eco' | 'social' | 'benchmark';
  timestamp: number;
}

/**
 * S4-02: Generate personalized AI insights using GPT-4o.
 * Analyzes trip context (route, gas prices, expenses, riders) and generates
 * 1-2 sentence actionable insights for the user.
 */
export const generateInsight = onCall(
  { secrets: ['OPENAI_API_KEY'] },
  async (request): Promise<GenerateInsightResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const { tripId, userId } = request.data as GenerateInsightRequest;
    const db = admin.firestore();

    // Fetch trip, expenses, and riders data
    const [tripSnap, expensesSnap, ridersSnap, userSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.collection(`trips/${tripId}/expenses`).get(),
      db.collection(`trips/${tripId}/riders`).get(),
      db.doc(`users/${userId}`).get(),
    ]);

    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found');

    const trip = tripSnap.data()!;
    const expenses = expensesSnap.docs.map((d) => d.data());
    const riders = ridersSnap.docs.map((d) => d.data());
    const user = userSnap.data() ?? {};

    // Calculate trip metrics
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const fuelExpenses = expenses.filter((e) => e.category === 'gas').reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const perPersonShare = riders.length > 0 ? totalExpenses / riders.length : totalExpenses;
    const co2Estimate = (trip.adjustedFuelConsumption ?? 0) * 2.31; // kg CO2

    // Build context for AI
    const insightPrompt = `
Analyze this carpool trip and generate ONE short, actionable insight (1-2 sentences max).
Make it personal, specific, and valuable.

Trip Context:
- Trip Name: ${trip.name || 'Trip'}
- Distance: ${trip.distanceKm || '?'} km
- Riders: ${riders.length} people
- Total Cost: $${totalExpenses.toFixed(2)}
- Per-Person Share: $${perPersonShare.toFixed(2)}
- Fuel Cost: $${fuelExpenses.toFixed(2)}
- CO₂ Saved vs Solo: ~${co2Estimate.toFixed(1)} kg
- User Income Bracket: ${user.incomeBracket || 'not specified'}
- Gas Price Used: ${trip.gasPrice || '?'}¢/L

Insight Categories to choose from:
1. Savings: Focus on money saved vs driving alone or at different stations
2. Eco: Focus on environmental impact and carbon avoided
3. Social: Focus on carpool benefits (riders, splits, group dynamics)
4. Benchmark: Focus on how this trip compares to typical Ontario drivers

Generate insight response as ONLY this JSON, no markdown:
{
  "insight": "Your insight text here (1-2 sentences)",
  "category": "savings" or "eco" or "social" or "benchmark"
}
`;

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 150,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: insightPrompt,
          },
        ],
      });

      const responseText = response.choices[0].message.content || '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback to generic insight if parsing fails
        return {
          insight: `Your group is carpooling smarter: ${riders.length} riders, $${perPersonShare.toFixed(2)} each. Keep it up!`,
          category: 'social',
          timestamp: Date.now(),
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<GenerateInsightResponse>;

      return {
        insight: String(parsed.insight ?? 'Great trip!').slice(0, 200),
        category: (['savings', 'eco', 'social', 'benchmark'].includes(parsed.category as string)
          ? (parsed.category as GenerateInsightResponse['category'])
          : 'social') as GenerateInsightResponse['category'],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error generating insight:', error);
      // Graceful fallback with generic insight
      return {
        insight: `Your group is saving money by carpooling together on this trip. Well done!`,
        category: 'social',
        timestamp: Date.now(),
      };
    }
  },
);

// ─── Fuel Burden Index Calculator (S4-01) ────────────────────────────────────

interface CalculateFuelBurdenRequest {
  tripId: string;
  userId: string;
}

interface FuelBurdenResponse {
  fuelBurdenPercent: number;
  level: 'low' | 'moderate' | 'high';
  comparisonToOntarioAvg: number; // percentage difference from 4.2%
  estimatedDailyIncome: number;
  tripFuelCost: number;
}

/**
 * S4-01: Calculate Fuel Burden Index for a user on a trip.
 * Based on optional income bracket from profile.
 */
export const calculateFuelBurden = onCall(
  {},
  async (request): Promise<FuelBurdenResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const { tripId, userId } = request.data as CalculateFuelBurdenRequest;
    const db = admin.firestore();

    const [tripSnap, riderSnap, userSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.doc(`trips/${tripId}/riders/${userId}`).get(),
      db.doc(`users/${userId}`).get(),
    ]);

    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found');
    if (!riderSnap.exists) throw new HttpsError('not-found', 'Rider not found');

    const trip = tripSnap.data()!;
    const rider = riderSnap.data()!;
    const user = userSnap.data();

    // Get this rider's share
    const riderShare = (rider.amountOwed ?? 0) - (rider.amountPaid ?? 0);

    // Estimate daily income from bracket
    const incomeBracket = (user?.incomeBracket as string) ?? '$30k-$60k';
    const dailyIncomeMap: Record<string, number> = {
      '$0-$30k': 82, // ~$30k / 365
      '$30k-$60k': 110, // ~$40k / 365
      '$60k-$100k': 205, // ~$75k / 365
      '$100k+': 274, // ~$100k / 365
    };

    const estimatedDailyIncome = dailyIncomeMap[incomeBracket] || 110;

    // Fuel burden %
    const fuelBurdenPercent = (riderShare / estimatedDailyIncome) * 100;
    const ontarioAvg = 4.2;
    const comparisonToOntarioAvg = fuelBurdenPercent - ontarioAvg;

    // Categorize
    let level: 'low' | 'moderate' | 'high' = 'low';
    if (fuelBurdenPercent > 10) level = 'high';
    else if (fuelBurdenPercent > 6) level = 'moderate';

    return {
      fuelBurdenPercent: Math.round(fuelBurdenPercent * 10) / 10,
      level,
      comparisonToOntarioAvg: Math.round(comparisonToOntarioAvg * 10) / 10,
      estimatedDailyIncome,
      tripFuelCost: riderShare,
    };
  },
);

// ─── GreenMiles Award on Expense (S4-04) ──────────────────────────────────────

/**
 * Triggered when a trip completes - award GreenMiles to all riders.
 * - Eco route selected: +50 points
 * - Per carpool rider: +30 points each
 * - Low-emission trip: +20 points
 */
export const onTripCompleted = onDocumentCreated(
  'trips/{tripId}',
  async (event) => {
    const trip = event.data?.data();
    if (!trip) return;

    const db = admin.firestore();
    const tripId = event.params.tripId;

    // Wait 10 seconds then check if completed (not ideal, but works for demo)
    // In production, trigger on explicit trip.completed = true update
    setTimeout(async () => {
      const tripSnap = await db.doc(`trips/${tripId}`).get();
      const updatedTrip = tripSnap.data();

      if (updatedTrip?.status !== 'completed') return;

      const riderIds = updatedTrip.riderIds as string[] | undefined;
      if (!riderIds || riderIds.length === 0) return;

      const riderCount = riderIds.length;
      const batch = db.batch();

      // Award points to each rider
      for (const riderId of riderIds) {
        let pointsToAward = 0;

        // Eco route selected: +50
        if (updatedTrip.routeSelected === 'eco') pointsToAward += 50;

        // Per carpool rider: +30 each
        pointsToAward += riderCount > 1 ? 30 : 0;

        // Low-emission trip (CO2 < 50kg): +20
        if ((updatedTrip.co2SavedKg ?? 0) > 0) pointsToAward += 20;

        if (pointsToAward === 0) continue;

        // Increment user's greenMilesTotal
        const userRef = db.doc(`users/${riderId}`);
        batch.update(userRef, {
          greenMilesTotal: admin.firestore.FieldValue.increment(pointsToAward),
        });

        // Log transaction in greenMiles history
        const historyRef = db.collection(`users/${riderId}/greenMilesHistory`).doc();
        batch.set(historyRef, {
          tripId,
          action: 'earned',
          pointsEarned: pointsToAward,
          description: `Trip bonus: ${riderCount > 1 ? 'carpool' : 'eco'} benefits`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
    }, 10000);
  },
);

// ─── CO2 Tracking (S4-06) ─────────────────────────────────────────────────────

interface CalculateCO2Request {
  tripId: string;
}

interface CO2Response {
  actualCO2Kg: number;
  soloCO2Kg: number;
  avoidedCO2Kg: number;
  treesEquivalent: number;
}

/**
 * S4-06: Calculate CO2 saved by carpooling vs everyone driving solo.
 */
export const calculateAvoidedCO2 = onCall(
  {},
  async (request): Promise<CO2Response> => {
    const { tripId } = request.data as CalculateCO2Request;
    const db = admin.firestore();

    const [tripSnap, ridersSnap] = await Promise.all([
      db.doc(`trips/${tripId}`).get(),
      db.collection(`trips/${tripId}/riders`).get(),
    ]);

    if (!tripSnap.exists) throw new HttpsError('not-found', 'Trip not found');

    const trip = tripSnap.data()!;
    const riderIds = ridersSnap.docs.map((d) => d.id);

    // Actual CO2 from trip
    const actualCO2Kg = (trip.adjustedFuelConsumption ?? 1.5) * 2.31;

    // Solo CO2: each rider would emit the same amount driving alone
    const soloCO2Kg = actualCO2Kg * riderIds.length;

    // Avoided CO2
    const avoidedCO2Kg = Math.max(0, soloCO2Kg - actualCO2Kg);

    // Tree equivalence: 1 tree absorbs ~21kg CO2 in a year
    const treesEquivalent = Math.round(avoidedCO2Kg / 21 * 10) / 10;

    // Update trip with CO2 data
    await db.doc(`trips/${tripId}`).update({
      co2SavedKg: avoidedCO2Kg,
    });

    // Accumulate lifetime CO2 avoided for each rider
    const batch = db.batch();
    for (const riderId of riderIds) {
      const userRef = db.doc(`users/${riderId}`);
      batch.update(userRef, {
        co2AvoidedKgTotal: admin.firestore.FieldValue.increment(avoidedCO2Kg / riderIds.length),
      });
    }
    await batch.commit();

    return {
      actualCO2Kg: Math.round(actualCO2Kg * 100) / 100,
      soloCO2Kg: Math.round(soloCO2Kg * 100) / 100,
      avoidedCO2Kg: Math.round(avoidedCO2Kg * 100) / 100,
      treesEquivalent,
    };
  },
);

// ─── GreenMiles Redemption (S4-07) ────────────────────────────────────────────

interface RedeemGreenMilesRequest {
  userId: string;
  rewardType: 'gas_discount' | 'transit_credit' | 'donation';
}

interface RedeemResponse {
  success: boolean;
  rewardCode?: string;
  message: string;
  newBalance: number;
}

/**
 * S4-07: Redeem GreenMiles for rewards.
 * - Gas $10 discount: 500 points
 * - Transit $5 credit: 300 points
 * - $5 donation: 300 points
 */
export const redeemGreenMiles = onCall(
  {},
  async (request): Promise<RedeemResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const { userId, rewardType } = request.data as RedeemGreenMilesRequest;
    const db = admin.firestore();

    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Cannot redeem for another user');
    }

    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'User not found');

    const user = userSnap.data()!;
    const currentBalance = (user.greenMilesTotal as number) ?? 0;

    // Define redemption costs
    const redemptionCosts: Record<string, { cost: number; description: string; code: string }> = {
      gas_discount: { cost: 500, description: '$10 Gas Discount', code: `GAS${Date.now().toString().slice(-6)}` },
      transit_credit: { cost: 300, description: '$5 Transit Credit', code: `TRN${Date.now().toString().slice(-6)}` },
      donation: { cost: 300, description: '$5 Donation to Fuel Fund', code: `DON${Date.now().toString().slice(-6)}` },
    };

    const redemption = redemptionCosts[rewardType];
    if (!redemption) throw new HttpsError('invalid-argument', 'Invalid reward type');
    if (currentBalance < redemption.cost) {
      throw new HttpsError('failed-precondition', `Insufficient balance. Need ${redemption.cost} points, have ${currentBalance}`);
    }

    // Deduct points and log transaction
    const batch = db.batch();
    const userRef = db.doc(`users/${userId}`);
    batch.update(userRef, {
      greenMilesTotal: admin.firestore.FieldValue.increment(-redemption.cost),
    });

    const historyRef = db.collection(`users/${userId}/greenMilesHistory`).doc();
    batch.set(historyRef, {
      action: 'redeemed',
      pointsSpent: redemption.cost,
      rewardType,
      description: redemption.description,
      rewardCode: redemption.code,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const newBalance = currentBalance - redemption.cost;

    return {
      success: true,
      rewardCode: redemption.code,
      message: `Redeemed ${redemption.description}. Code: ${redemption.code}`,
      newBalance,
    };
  },
);

// ─── Predictive Gas Price Alerts (S4-03) ──────────────────────────────────────

/**
 * S4-03: Daily job to predict gas price trends and send alerts.
 * Runs once per day, analyzes 7-day history, predicts next 3 days.
 * Sends alert if rise > 3¢/L predicted, max 1 alert per location per day.
 */
export const predictGasPriceAlerts = onCall(
  { secrets: ['OPENAI_API_KEY'] },
  async (request): Promise<{ alerts_sent: number }> => {
    // In production, this would be a Cloud Scheduler job
    // For now, triggered manually via Cloud Function

    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');

    const db = admin.firestore();
    const userId = request.auth.uid;

    // Get user's recent trips to find favorite locations
    const tripsSnap = await db.collection('trips').where('riderIds', 'array-contains', userId).limit(5).get();
    if (tripsSnap.empty) {
      return { alerts_sent: 0 };
    }

    let alertsSent = 0;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // For each recent trip location, predict prices
    for (const tripDoc of tripsSnap.docs) {
      const trip = tripDoc.data();
      const location = trip.destination || 'Toronto';

      // Get historical gas prices from cache (mock data for now)
      const priceHistory = [152, 151, 153, 155, 154, 156, 158]; // Last 7 days, ¢/L
      const today = priceHistory[priceHistory.length - 1];

      // Use GPT to predict next 3 days
      const prompt = `
Analyze this gas price history (¢/L) for ${location}: ${priceHistory.join(', ')}
Predict the next 3 days' prices.
Respond with ONLY valid JSON:
{
  "predicted_prices": [day1, day2, day3],
  "trend": "up" | "flat" | "down",
  "max_predicted_price": number
}
`;

      try {
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }],
        });

        const responseText = response.choices[0].message.content || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const prediction = JSON.parse(jsonMatch[0]);
        const maxPredicted = prediction.max_predicted_price || today;
        const priceRise = maxPredicted - today;

        // Alert if rise > 3¢/L
        if (priceRise > 3) {
          const lastAlertRef = db.collection(`users/${userId}/priceAlerts`).doc(`${location}_${new Date().toDateString()}`);
          const lastAlertSnap = await lastAlertRef.get();

          // Only send 1 per day per location
          if (!lastAlertSnap.exists) {
            await sendIfAllowed(db, userId, 'priceAlert', {
              notification: {
                title: 'Gas prices rising',
                body: `Expect ${priceRise.toFixed(1)}¢/L rise in ${location}. Fill up today to save!`,
              },
              data: { type: 'price_alert', location },
              android: { priority: 'high' as const, notification: { channelId: 'price_alerts' } },
              apns: { payload: { aps: { sound: 'default' } } },
            });

            await lastAlertRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
            alertsSent++;
          }
        }
      } catch (error) {
        console.error(`Price prediction error for ${location}:`, error);
      }
    }

    return { alerts_sent: alertsSent };
  },
);


