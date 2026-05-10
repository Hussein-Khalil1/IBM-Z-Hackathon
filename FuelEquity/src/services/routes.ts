/**
 * Routes Service
 * Handles route comparison, fuel cost calculations, and route selection.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface RouteOption {
  id: 'eco' | 'fast' | 'alternate';
  label: string;
  distanceKm: number;
  durationMinutes: number;
  elevationGainM: number;
  terrainPenalty: number; // percentage (e.g., 5 = +5%)
  baseFuelConsumption: number; // litres
  adjustedFuelConsumption: number; // with terrain penalty
  fuelCostCAD: number;
  terrainDifficulty: 'flat' | 'moderate' | 'hilly';
  gasPrice: number; // cents per litre
}

export interface CompareRoutesRequest {
  origin: Location;
  destination: Location;
  baseFuelEfficiency: number; // L/100km
  gasPrice: number; // cents per litre
}

export interface CompareRoutesResponse {
  routes: RouteOption[];
  recommended: RouteOption;
}

/**
 * Compare multiple route options (eco vs fast).
 * Calculates fuel costs accounting for terrain elevation.
 */
export async function compareRoutes(data: CompareRoutesRequest): Promise<CompareRoutesResponse> {
  const compareRoutesFunc = httpsCallable(functions, 'compareRoutes') as (
    data: CompareRoutesRequest,
  ) => Promise<{ data: CompareRoutesResponse }>;

  try {
    const result = await compareRoutesFunc(data);
    return result.data;
  } catch (error: any) {
    console.error('Failed to compare routes:', error);
    throw new Error(error.message || 'Failed to compare routes');
  }
}

/**
 * Format distance for display.
 */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} km`;
}

/**
 * Format duration in minutes to "Xh Ym" format.
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Get terrain difficulty badge color.
 */
export function getTerrainColor(difficulty: 'flat' | 'moderate' | 'hilly'): string {
  switch (difficulty) {
    case 'flat':
      return '#10b981'; // green
    case 'moderate':
      return '#f59e0b'; // amber
    case 'hilly':
      return '#ef4444'; // red
  }
}

/**
 * Format fuel cost for display.
 */
export function formatCost(cad: number): string {
  return `$${cad.toFixed(2)}`;
}

/**
 * Calculate savings between two routes.
 */
export function calculateSavings(route1: RouteOption, route2: RouteOption): number {
  return Math.abs(route1.fuelCostCAD - route2.fuelCostCAD);
}

/**
 * Get recommendation reason text.
 */
export function getRecommendationReason(
  route: RouteOption,
  allRoutes: RouteOption[],
): string {
  const cheapest = allRoutes[0]?.fuelCostCAD;
  const mostExpensive = allRoutes[allRoutes.length - 1]?.fuelCostCAD;

  if (route.id === 'eco') {
    if (cheapest === route.fuelCostCAD) {
      const savings = mostExpensive - cheapest;
      return `Saves ${formatCost(savings)} vs. most expensive route`;
    }
    return 'Balanced efficiency and time';
  }

  if (route.id === 'fast') {
    const timeSaved = allRoutes[0]?.durationMinutes - route.durationMinutes;
    return `${timeSaved || 0}+ minutes faster`;
  }

  return 'Alternative route option';
}
