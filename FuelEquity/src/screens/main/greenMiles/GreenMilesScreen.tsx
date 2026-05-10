import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { calculateFuelBurden, getBurdenLevelColor, getBurdenLevelIcon, type BurdenLevel } from '../../../services/fuelBurden';
import { generateAIInsight, getInsightDisplay, type AIInsight } from '../../../services/aiInsights';
import { predictGasPrices, getDirectionDisplay, formatPrice, type PriceAlert } from '../../../services/pricePrediction';

interface TripContext {
  tripId: string;
  latitude: number;
  longitude: number;
}

interface S4Data {
  fuelBurden: any | null;
  aiInsight: AIInsight | null;
  priceAlert: PriceAlert | null;
  loading: boolean;
  error: string | null;
}

export default function GreenMilesScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<S4Data>({
    fuelBurden: null,
    aiInsight: null,
    priceAlert: null,
    loading: true,
    error: null,
  });

  // Mock active trip for demo (in real app, fetch from Firestore)
  const mockTrip: TripContext = {
    tripId: 'trip_demo_001',
    latitude: 43.6629,
    longitude: -79.3957, // Toronto
  };

  const loadSprint4Data = async () => {
    try {
      setData((prev) => ({ ...prev, loading: true, error: null }));

      if (!user?.uid) {
        setData((prev) => ({ ...prev, error: 'Not authenticated' }));
        return;
      }

      // Load all Sprint 4 data in parallel
      const [fuelBurden, aiInsight, priceAlert] = await Promise.all([
        calculateFuelBurden(mockTrip.tripId, user.uid).catch((e) => {
          console.warn('Fuel burden fetch failed:', e);
          return null;
        }),
        generateAIInsight(mockTrip.tripId, user.uid).catch((e) => {
          console.warn('AI insight fetch failed:', e);
          return null;
        }),
        predictGasPrices(mockTrip.latitude, mockTrip.longitude).catch((e) => {
          console.warn('Price prediction fetch failed:', e);
          return null;
        }),
      ]);

      setData({
        fuelBurden,
        aiInsight,
        priceAlert,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading Sprint 4 data:', error);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to load data',
      }));
    }
  };

  useEffect(() => {
    loadSprint4Data();
  }, [user?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSprint4Data();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>GreenMiles Dashboard</Text>
          <Text style={styles.subtitle}>Sprint 4: AI Insights & Eco Tracking</Text>
        </View>

        {data.loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : data.error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{data.error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadSprint4Data}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* S4-01: Fuel Burden Index Card */}
            {data.fuelBurden && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>💰 Fuel Burden Index</Text>
                </View>
                <View style={styles.burdenContent}>
                  <View style={styles.burdenDisplay}>
                    <Text
                      style={[
                        styles.burdenValue,
                        { color: getBurdenLevelColor(data.fuelBurden.burdenLevel) },
                      ]}
                    >
                      {data.fuelBurden.burdenPercent.toFixed(1)}%
                    </Text>
                    <Text style={styles.burdenLevel}>
                      {getBurdenLevelIcon(data.fuelBurden.burdenLevel)}{' '}
                      {data.fuelBurden.burdenLevel.charAt(0).toUpperCase() +
                        data.fuelBurden.burdenLevel.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.burdenDetails}>
                    <Text style={styles.detailText}>Trip fuel cost: ${data.fuelBurden.fuelCostCAD.toFixed(2)}</Text>
                    <Text style={styles.detailText}>
                      Daily income: ${data.fuelBurden.estimatedMonthlyIncomeCAD / 30 || 95} /day
                    </Text>
                    <Text style={styles.comparisonText}>{data.fuelBurden.comparisonMessage}</Text>
                    <Text style={styles.detailLabel}>Ontario average: {data.fuelBurden.ontarioAveragePercent}%</Text>
                  </View>
                </View>
              </View>
            )}

            {/* S4-02: AI Insight Card */}
            {data.aiInsight && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{getInsightDisplay(data.aiInsight.category).icon} AI Insight</Text>
                  <Text style={styles.confidenceText}>{data.aiInsight.confidence}% confident</Text>
                </View>
                <Text style={styles.insightText}>{data.aiInsight.insight}</Text>
                <Text style={styles.insightCategory}>
                  {getInsightDisplay(data.aiInsight.category).label}
                </Text>
              </View>
            )}

            {/* S4-03: 3-Day Price Prediction Card */}
            {data.priceAlert && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>📊 3-Day Price Outlook</Text>
                </View>
                <Text style={styles.summaryText}>{data.priceAlert.summaryMessage}</Text>

                {/* Price predictions grid */}
                <View style={styles.predictionGrid}>
                  {data.priceAlert.nextThreeDaysPrediction.map((pred, idx) => {
                    const { icon, color } = getDirectionDisplay(pred.direction);
                    const date = new Date(pred.predictionFor);
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                    return (
                      <View key={idx} style={styles.predictionCard}>
                        <Text style={styles.predictionDay}>{dayName}</Text>
                        <Text style={styles.predictionPrice}>{formatPrice(pred.predictedPricePerLitre)}</Text>
                        <Text style={[styles.predictionDirection, { color }]}>{icon}</Text>
                        <Text style={styles.predictionConfidence}>{pred.confidence}%</Text>
                        {pred.recommendedFillupToday && (
                          <Text style={styles.recommendedTag}>Fillup today!</Text>
                        )}
                        {pred.estimatedSavings > 0 && (
                          <Text style={styles.savingsText}>Save ${pred.estimatedSavings.toFixed(2)}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* S4-04 Placeholder: GreenMiles Balance */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>🎯 GreenMiles Balance</Text>
              </View>
              <View style={styles.balanceDisplay}>
                <Text style={styles.balanceValue}>250 pts</Text>
                <Text style={styles.balanceLabel}>~$12.50 value</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: '65%' }]} />
              </View>
              <Text style={styles.progressText}>250 / 350 pts to next reward tier</Text>
            </View>

            {/* S4-06 Placeholder: Community Impact */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>🌍 Community Impact</Text>
              </View>
              <View style={styles.impactGrid}>
                <View style={styles.impactBox}>
                  <Text style={styles.impactValue}>2,450 kg</Text>
                  <Text style={styles.impactLabel}>CO₂ Avoided</Text>
                </View>
                <View style={styles.impactBox}>
                  <Text style={styles.impactValue}>$1,240</Text>
                  <Text style={styles.impactLabel}>Saved</Text>
                </View>
                <View style={styles.impactBox}>
                  <Text style={styles.impactValue}>117</Text>
                  <Text style={styles.impactLabel}>Trips Split</Text>
                </View>
              </View>
              <Text style={styles.treeEquivalent}>🌱 Equivalent to planting 117 trees</Text>
            </View>

            {/* S4-07 Placeholder: Redeem Button */}
            <TouchableOpacity 
              style={styles.redeemButton}
              onPress={() => navigation.navigate('GreenMilesRedeem')}
            >
              <Text style={styles.redeemButtonText}>🎁 Redeem Rewards</Text>
            </TouchableOpacity>

            {/* S4-04 Placeholder: Earn History */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>📜 Earning History</Text>
              </View>
              <View style={styles.historyItem}>
                <View>
                  <Text style={styles.historyAction}>Eco route selected</Text>
                  <Text style={styles.historyDate}>Today at 2:30 PM</Text>
                </View>
                <Text style={styles.historyPoints}>+50</Text>
              </View>
              <View style={styles.historyItem}>
                <View>
                  <Text style={styles.historyAction}>Carpooled with 3 riders</Text>
                  <Text style={styles.historyDate}>Yesterday</Text>
                </View>
                <Text style={styles.historyPoints}>+90</Text>
              </View>
              <View style={styles.historyItem}>
                <View>
                  <Text style={styles.historyAction}>Price report submitted</Text>
                  <Text style={styles.historyDate}>2 days ago</Text>
                </View>
                <Text style={styles.historyPoints}>+10</Text>
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: Colors.background },
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  subtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 4 },

  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 400 },
  errorContainer: { margin: 16, padding: 16, backgroundColor: '#fee2e2', borderRadius: 8 },
  errorText: { color: '#991b1b', fontSize: FontSize.sm, marginBottom: 12 },
  retryButton: { backgroundColor: Colors.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  retryButtonText: { color: '#fff', fontWeight: FontWeight.semibold, textAlign: 'center' },

  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  confidenceText: { color: Colors.textMuted, fontSize: FontSize.xs },

  // Fuel Burden Styles
  burdenContent: { flexDirection: 'row', alignItems: 'center' },
  burdenDisplay: { alignItems: 'center', marginRight: 20 },
  burdenValue: { fontSize: 40, fontWeight: FontWeight.bold },
  burdenLevel: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 4 },
  burdenDetails: { flex: 1 },
  detailText: { color: Colors.textSecondary, fontSize: FontSize.xs, marginBottom: 4 },
  detailLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 6, fontWeight: FontWeight.semibold },
  comparisonText: { color: Colors.success, fontSize: FontSize.xs, marginTop: 6, fontWeight: FontWeight.semibold },

  // AI Insight Styles
  insightText: { color: Colors.textPrimary, fontSize: FontSize.sm, lineHeight: 20, marginBottom: 8 },
  insightCategory: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  // Price Prediction Styles
  summaryText: { color: Colors.textPrimary, fontSize: FontSize.sm, marginBottom: 12 },
  predictionGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  predictionCard: {
    flex: 1,
    marginRight: 8,
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    alignItems: 'center',
  },
  predictionDay: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  predictionPrice: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginTop: 4 },
  predictionDirection: { fontSize: 20, marginTop: 4 },
  predictionConfidence: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 4 },
  recommendedTag: { color: Colors.success, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, marginTop: 4 },
  savingsText: { color: Colors.success, fontSize: FontSize.xs, marginTop: 4 },

  // GreenMiles Balance Styles
  balanceDisplay: { alignItems: 'center', marginBottom: 12 },
  balanceValue: { color: Colors.success, fontSize: 32, fontWeight: FontWeight.bold },
  balanceLabel: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 4 },
  progressBar: { height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: Colors.success },
  progressText: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' },

  // Community Impact Styles
  impactGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  impactBox: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  impactValue: { color: Colors.primary, fontSize: FontSize.base, fontWeight: FontWeight.bold },
  impactLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 4 },
  treeEquivalent: { color: Colors.success, fontSize: FontSize.sm, textAlign: 'center', fontWeight: FontWeight.semibold },

  // Redeem Button
  redeemButton: {
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 14,
    backgroundColor: Colors.success,
    borderRadius: 8,
    alignItems: 'center',
  },
  redeemButtonText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // History Styles
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  historyAction: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  historyDate: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 4 },
  historyPoints: { color: Colors.success, fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  bottomSpacer: { height: 40 },
});
