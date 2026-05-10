/**
 * Gas Prices Service
 * Fetches live gas prices from nearby stations via Cloud Function.
 * Caches prices locally for offline access and reduced API load.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface GasStation {
  id: string;
  name: string;
  brand?: string;
  pricePerLitre: number; // cents/litre (e.g., 15299 = 152.99¢/L)
  distance: number; // km
  latitude: number;
  longitude: number;
  lastUpdated: number; // timestamp
}

export interface GetGasPricesResponse {
  stations: GasStation[];
  cached: boolean;
  cacheExpiry: number; // timestamp when cache expires
}

/**
 * Format price from cents/litre to human-readable string.
 * @param centresPerLitre Price in cents/litre (e.g., 15299 = 152.99¢/L)
 * @returns Formatted string (e.g., "152.99 ¢/L")
 */
export function formatGasPrice(centresPerLitre: number): string {
  const dollars = (centresPerLitre / 100).toFixed(2);
  return `${dollars} ¢/L`;
}

/**
 * Get nearby gas stations with live prices.
 * Results are cached for 15 minutes to reduce API calls.
 *
 * @param latitude User's latitude
 * @param longitude User's longitude
 * @param radiusKm Search radius (default: 5 km)
 * @returns Sorted list of nearby stations (cheapest first)
 */
export async function getNearbyGasPrices(
  latitude: number,
  longitude: number,
  radiusKm: number = 5,
): Promise<GetGasPricesResponse> {
  const getGasPrices = httpsCallable(functions, 'getGasPrices') as (data: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  }) => Promise<{ data: GetGasPricesResponse }>;

  try {
    const result = await getGasPrices({
      latitude,
      longitude,
      radiusKm,
    });
    return result.data;
  } catch (error: any) {
    console.error('Failed to fetch gas prices:', error);
    throw new Error(error.message || 'Failed to fetch nearby gas prices');
  }
}

/**
 * Calculate price trend indicator.
 * @param pricePerLitre Current price in cents/litre
 * @param avgPrice Average market price in cents/litre
 * @returns 'up' | 'flat' | 'down'
 */
export function getPriceTrend(pricePerLitre: number, avgPrice: number): 'up' | 'flat' | 'down' {
  const diff = pricePerLitre - avgPrice;
  if (diff > 100) return 'up'; // More than 1¢ above average
  if (diff < -100) return 'down'; // More than 1¢ below average
  return 'flat';
}

/**
 * Calculate distance in km from decimal coordinates.
 * Uses Haversine formula for great-circle distance.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get the cheapest station from a list.
 */
export function getCheapestStation(stations: GasStation[]): GasStation | null {
  if (!stations.length) return null;
  return stations[0]; // Already sorted by price
}

/**
 * Calculate savings by filling up at cheapest vs most expensive station.
 * @param tankSize Vehicle's tank size in litres (default: 60L)
 * @param stations List of nearby stations (assumed sorted by price)
 * @returns Savings in dollars
 */
export function calculateSavings(stations: GasStation[], tankSize: number = 60): number {
  if (stations.length < 2) return 0;
  const cheapest = stations[0].pricePerLitre;
  const expensive = stations[stations.length - 1].pricePerLitre;
  const savingsCents = (expensive - cheapest) * tankSize;
  return savingsCents / 100; // Convert to dollars
}

/**
 * Format time since update.
 * @param timestamp Milliseconds since epoch
 * @returns Human-readable string (e.g., "5m ago", "2h ago")
 */
export function formatTimeSinceUpdate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
