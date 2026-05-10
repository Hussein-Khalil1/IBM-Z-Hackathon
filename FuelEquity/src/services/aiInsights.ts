import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type InsightCategory = 'savings' | 'eco' | 'social' | 'benchmark';

export interface AIInsight {
  insight: string;
  category: InsightCategory;
  timestamp: number;
  confidence?: number;
}

/**
 * S4-02: Generate personalized AI insights for a trip
 */
export async function generateAIInsight(tripId: string, userId: string): Promise<AIInsight> {
  try {
    const generateInsightFn = httpsCallable(functions, 'generateInsight');
    const result = await generateInsightFn({
      tripId,
      userId,
    });

    const data = result.data as any;

    return {
      insight: data.insight || 'Great trip!',
      category: data.category || 'social',
      timestamp: data.timestamp || Date.now(),
      confidence: 85, // Mock confidence
    };
  } catch (error) {
    console.error('AI insight generation error:', error);
    // Return fallback insight
    return {
      insight: 'Your group is making a positive impact through carpooling.',
      category: 'social',
      timestamp: Date.now(),
      confidence: 0,
    };
  }
}

export function getInsightDisplay(category: InsightCategory) {
  const displays = {
    savings: {
      label: 'Money Saved',
      icon: '💰',
      color: '#4caf50',
    },
    eco: {
      label: 'Environmental',
      icon: '🌍',
      color: '#2196f3',
    },
    social: {
      label: 'Community',
      icon: '👥',
      color: '#9c27b0',
    },
    benchmark: {
      label: 'Comparison',
      icon: '📊',
      color: '#ff9800',
    },
  };

  return displays[category] || displays.social;
}
