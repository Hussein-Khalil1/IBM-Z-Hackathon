/**
 * Fuel Consumption Model (S3-05)
 * Calculates vehicle fuel consumption based on:
 * - Base efficiency (L/100km)
 * - Terrain (elevation gain)
 * - Traffic conditions
 * - Weather (temperature, wind)
 * - Vehicle load
 */

export interface ConsumptionModifier {
  name: string;
  description: string;
  percentageChange: number; // positive = increased consumption
  icon?: string;
}

export interface FuelConsumptionInput {
  baseLPer100km: number; // Vehicle's base fuel efficiency
  distanceKm: number;
  elevationGainM: number; // Total elevation gain in meters
  weatherTemp: number; // Current temperature in Celsius
  windSpeedKmh: number;
  windDirection?: number; // 0-360, direction the wind is coming FROM
  vehicleHeading?: number; // 0-360, direction vehicle is heading
  trafficCondition?: 'light' | 'moderate' | 'heavy'; // Default: 'moderate'
  numberOfPassengers?: number; // Additional passengers (1+ adds weight)
  acEnabled?: boolean; // Air conditioning
  trunkLoad?: number; // kg of extra weight
}

export interface ConsumptionResult {
  baseFuelLitres: number; // Without any modifiers
  adjustedFuelLitres: number; // With all modifiers applied
  modifiers: ConsumptionModifier[];
  totalPenaltyPercent: number;
  estimatedCostCAD: number;
}

// ─── Modifier Constants ────────────────────────────────────────────────────────

const TERRAIN_PENALTY_PER_100M = 5; // +5% per 100m elevation gain
const TRAFFIC_PENALTIES = {
  light: -2, // -2% fuel consumption (better highway speeds)
  moderate: 0, // Baseline
  heavy: 8, // +8% fuel consumption (stop & go)
};
const COLD_TEMP_THRESHOLD = 5; // °C below which cold penalty applies
const COLD_PENALTY_BASE = 4; // +4% for cold start
const COLD_PENALTY_PER_DEGREE = 0.5; // Additional % per degree below 5°C
const HOT_TEMP_THRESHOLD = 30; // °C above which AC penalty applies
const AC_PENALTY = 8; // +8% when AC is needed
const WIND_THRESHOLD_KMH = 20;
const HEADWIND_PENALTY_PER_10KMH = 2; // +2% per 10 km/h headwind
const WEIGHT_PENALTY_PER_100KG = 1; // +1% per 100kg extra weight

// ─── Main Calculation ──────────────────────────────────────────────────────────

/**
 * Calculate estimated fuel consumption with all modifiers applied.
 */
export function calculateFuelConsumption(
  input: FuelConsumptionInput,
  gasPrice: number = 15299, // cents per litre default
): ConsumptionResult {
  const modifiers: ConsumptionModifier[] = [];
  let totalPenaltyPercent = 0;

  // Base consumption (no modifiers)
  const baseFuelLitres = (input.distanceKm / 100) * input.baseLPer100km;

  // ─── Terrain Modifier ────────────────────────────────────────────────────────
  const terrainPenalty = (input.elevationGainM / 100) * TERRAIN_PENALTY_PER_100M;
  if (terrainPenalty > 0) {
    modifiers.push({
      name: 'Terrain',
      description: `+${input.elevationGainM}m elevation gain`,
      percentageChange: terrainPenalty,
      icon: '⛰️',
    });
    totalPenaltyPercent += terrainPenalty;
  }

  // ─── Traffic Modifier ────────────────────────────────────────────────────────
  const traffic = input.trafficCondition || 'moderate';
  const trafficPenalty = TRAFFIC_PENALTIES[traffic];
  if (trafficPenalty !== 0) {
    modifiers.push({
      name: 'Traffic',
      description: traffic.charAt(0).toUpperCase() + traffic.slice(1),
      percentageChange: trafficPenalty,
      icon: traffic === 'heavy' ? '🚦' : traffic === 'light' ? '🛣️' : '🚗',
    });
    totalPenaltyPercent += trafficPenalty;
  }

  // ─── Temperature Modifier (Cold) ──────────────────────────────────────────────
  if (input.weatherTemp < COLD_TEMP_THRESHOLD) {
    const tempDiff = COLD_TEMP_THRESHOLD - input.weatherTemp;
    const coldPenalty = COLD_PENALTY_BASE + tempDiff * COLD_PENALTY_PER_DEGREE;
    modifiers.push({
      name: 'Cold Start',
      description: `${input.weatherTemp}°C (threshold: ${COLD_TEMP_THRESHOLD}°C)`,
      percentageChange: coldPenalty,
      icon: '🥶',
    });
    totalPenaltyPercent += coldPenalty;
  }

  // ─── Air Conditioning or Heat ─────────────────────────────────────────────────
  if (input.acEnabled || input.weatherTemp > HOT_TEMP_THRESHOLD) {
    modifiers.push({
      name: 'AC / Heating',
      description: input.acEnabled ? 'AC enabled' : `${input.weatherTemp}°C (needs AC)`,
      percentageChange: AC_PENALTY,
      icon: '❄️',
    });
    totalPenaltyPercent += AC_PENALTY;
  }

  // ─── Wind Modifier ────────────────────────────────────────────────────────────
  if (input.windSpeedKmh > WIND_THRESHOLD_KMH && input.vehicleHeading !== undefined) {
    const headwindKmh = calculateHeadwindComponent(input.windDirection || 0, input.vehicleHeading);
    if (headwindKmh > 0) {
      const windPenalty = (headwindKmh / 10) * HEADWIND_PENALTY_PER_10KMH;
      modifiers.push({
        name: 'Headwind',
        description: `${headwindKmh.toFixed(0)} km/h headwind`,
        percentageChange: windPenalty,
        icon: '💨',
      });
      totalPenaltyPercent += windPenalty;
    }
  }

  // ─── Weight Penalty ───────────────────────────────────────────────────────────
  const extraWeight = (input.numberOfPassengers || 0) * 75 + (input.trunkLoad || 0); // ~75kg per person
  if (extraWeight > 0) {
    const weightPenalty = (extraWeight / 100) * WEIGHT_PENALTY_PER_100KG;
    modifiers.push({
      name: 'Extra Weight',
      description: `${extraWeight}kg additional weight`,
      percentageChange: weightPenalty,
      icon: '⚖️',
    });
    totalPenaltyPercent += weightPenalty;
  }

  // ─── Calculate Final Consumption ──────────────────────────────────────────────
  const adjustedFuelLitres = baseFuelLitres * (1 + totalPenaltyPercent / 100);
  const costCents = adjustedFuelLitres * gasPrice;
  const estimatedCostCAD = costCents / 100;

  return {
    baseFuelLitres,
    adjustedFuelLitres,
    modifiers,
    totalPenaltyPercent,
    estimatedCostCAD,
  };
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Calculate the headwind component of wind.
 * Positive = headwind, Negative = tailwind
 * @param windDirection Direction wind is coming FROM (0-360)
 * @param vehicleHeading Direction vehicle is heading (0-360)
 * @returns Headwind component in km/h
 */
function calculateHeadwindComponent(windDirection: number, vehicleHeading: number): number {
  const angleDiff = Math.abs(vehicleHeading - windDirection);
  const normalizedAngle = Math.min(angleDiff, 360 - angleDiff);
  // Headwind is strongest at 0° (wind from front), weakest at 90° (side wind)
  const headwindComponent = Math.cos((normalizedAngle * Math.PI) / 180);
  return Math.max(0, headwindComponent * 20); // Max 20 km/h headwind
}

/**
 * Format consumption result for display.
 */
export function formatConsumption(result: ConsumptionResult): string {
  const increase = ((result.adjustedFuelLitres - result.baseFuelLitres) / result.baseFuelLitres) * 100;
  return `${result.adjustedFuelLitres.toFixed(1)}L (${increase > 0 ? '+' : ''}${increase.toFixed(0)}%)`;
}

/**
 * Get a friendly description of the consumption level.
 */
export function getConsumptionLevel(result: ConsumptionResult): 'low' | 'moderate' | 'high' {
  if (result.totalPenaltyPercent < 5) return 'low';
  if (result.totalPenaltyPercent < 15) return 'moderate';
  return 'high';
}

/**
 * Get color for consumption gauge.
 */
export function getConsumptionColor(level: 'low' | 'moderate' | 'high'): string {
  switch (level) {
    case 'low':
      return '#10b981'; // green
    case 'moderate':
      return '#f59e0b'; // amber
    case 'high':
      return '#ef4444'; // red
  }
}
