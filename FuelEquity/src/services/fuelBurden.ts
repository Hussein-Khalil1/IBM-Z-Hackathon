import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type BurdenLevel = 'low' | 'moderate' | 'high';

export interface FuelBurdenData {
  fuelBurdenPercent: number;
  level: BurdenLevel;
  comparisonToOntarioAvg: number;
  estimatedDailyIncome: number;
  tripFuelCost: number;
  // Computed values for UI
  burdenPercent: number;
  burdenLevel: BurdenLevel;
  fuelCostCAD: number;
  estimatedMonthlyIncomeCAD: number;
  ontarioAveragePercent: number;
  comparisonMessage: string;
}

/**
 * S4-01: Calculate Fuel Burden Index for a user on a trip
 */
export async function calculateFuelBurden(tripId: string, userId: string): Promise<FuelBurdenData> {
  try {
    const calculateFuelBurdenFn = httpsCallable(functions, 'calculateFuelBurden');
    const result = await calculateFuelBurdenFn({
      tripId,
      userId,
    });

    const data = result.data as any;

    // Compute UI-friendly values
    const monthlyIncome = (data.estimatedDailyIncome || 110) * 30;
    const comparison = data.comparisonToOntarioAvg || 0;
    const comparisonMessage =
      comparison > 2
        ? `⚠️ ${Math.abs(comparison).toFixed(1)}% higher than average`
        : comparison < -2
          ? `✅ ${Math.abs(comparison).toFixed(1)}% lower than average`
          : `📊 Close to Ontario average`;

    return {
      fuelBurdenPercent: data.fuelBurdenPercent || 0,
      level: data.level || 'moderate',
      comparisonToOntarioAvg: data.comparisonToOntarioAvg || 0,
      estimatedDailyIncome: data.estimatedDailyIncome || 110,
      tripFuelCost: data.tripFuelCost || 0,
      // UI values
      burdenPercent: data.fuelBurdenPercent || 0,
      burdenLevel: data.level || 'moderate',
      fuelCostCAD: data.tripFuelCost || 0,
      estimatedMonthlyIncomeCAD: monthlyIncome,
      ontarioAveragePercent: 4.2,
      comparisonMessage,
    };
  } catch (error) {
    console.error('Fuel burden calculation error:', error);
    throw error;
  }
}

export function getBurdenLevelColor(level: BurdenLevel): string {
  switch (level) {
    case 'low':
      return '#4caf50'; // Green
    case 'moderate':
      return '#ff9800'; // Amber
    case 'high':
      return '#f44336'; // Red
    default:
      return '#999';
  }
}

export function getBurdenLevelIcon(level: BurdenLevel): string {
  switch (level) {
    case 'low':
      return '✅';
    case 'moderate':
      return '⚠️';
    case 'high':
      return '🔴';
    default:
      return '❓';
  }
}

/**
 * Calculate CO2 avoided for a trip
 */
export async function calculateAvoidedCO2(tripId: string) {
  try {
    const calculateCO2Fn = httpsCallable(functions, 'calculateAvoidedCO2');
    const result = await calculateCO2Fn({ tripId });
    return result.data;
  } catch (error) {
    console.error('CO2 calculation error:', error);
    throw error;
  }
}
