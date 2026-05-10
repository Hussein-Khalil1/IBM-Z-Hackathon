/**
 * Route Picker Screen (S3-04)
 * Displays eco vs fast route options side-by-side.
 * User can select which route to use for the trip.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme';
import {
  compareRoutes,
  RouteOption,
  formatDistance,
  formatDuration,
  formatCost,
  getTerrainColor,
  calculateSavings,
  getRecommendationReason,
} from '../../../services/routes';

interface RoutePickerScreenProps {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  baseFuelEfficiency: number; // L/100km
  gasPrice: number; // cents per litre
  onRouteSelected?: (route: RouteOption) => void;
}

export const RoutePickerScreen: React.FC<RoutePickerScreenProps> = ({
  origin,
  destination,
  baseFuelEfficiency,
  gasPrice,
  onRouteSelected,
}) => {
  const { colors, spacing } = useAppTheme();
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [recommended, setRecommended] = useState<RouteOption | null>(null);
  const [selected, setSelected] = useState<'eco' | 'fast' | 'alternate' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const result = await compareRoutes({
        origin,
        destination,
        baseFuelEfficiency,
        gasPrice,
      });
      setRoutes(result.routes);
      setRecommended(result.recommended);
      setSelected(result.recommended.id);
    } catch (error: any) {
      Alert.alert('Error', `Failed to compare routes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRoute = (routeId: string) => {
    setSelected(routeId as any);
    const selectedRoute = routes.find((r) => r.id === routeId);
    if (selectedRoute && onRouteSelected) {
      onRouteSelected(selectedRoute);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.neutral }]}>
            Comparing routes...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Choose Your Route</Text>
        <Text style={[styles.subtitle, { color: colors.neutral }]}>
          Select route to compare costs and time
        </Text>
      </View>

      {/* Route Options */}
      <View style={styles.routesContainer}>
        {routes.map((route) => {
          const isSelected = selected === route.id;
          const isRecommended = recommended?.id === route.id;
          const savings = routes.length > 1 ? calculateSavings(route, routes[1]) : 0;

          return (
            <TouchableOpacity
              key={route.id}
              style={[
                styles.routeCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              onPress={() => handleSelectRoute(route.id)}
              activeOpacity={0.7}
            >
              {/* Badge */}
              {isRecommended && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.primary + '20' },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>
                    Recommended
                  </Text>
                </View>
              )}

              {/* Route Label */}
              <Text style={[styles.routeLabel, { color: colors.text }]}>
                {route.label}
              </Text>

              {/* Main Metrics */}
              <View style={styles.metricsGrid}>
                {/* Distance & Time */}
                <View style={styles.metric}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                  <Text style={[styles.metricLabel, { color: colors.neutral }]}>
                    Distance
                  </Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {formatDistance(route.distanceKm)}
                  </Text>
                </View>

                <View style={styles.metric}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <Text style={[styles.metricLabel, { color: colors.neutral }]}>
                    Time
                  </Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {formatDuration(route.durationMinutes)}
                  </Text>
                </View>

                {/* Fuel Cost */}
                <View style={styles.metric}>
                  <Ionicons name="flash" size={18} color={colors.success} />
                  <Text style={[styles.metricLabel, { color: colors.neutral }]}>
                    Fuel Cost
                  </Text>
                  <Text style={[styles.metricValue, { color: colors.success }]}>
                    {formatCost(route.fuelCostCAD)}
                  </Text>
                </View>
              </View>

              {/* Consumption & Terrain */}
              <View style={styles.consumptionRow}>
                <View>
                  <Text style={[styles.consumptionLabel, { color: colors.neutral }]}>
                    Base fuel
                  </Text>
                  <Text style={[styles.consumptionValue, { color: colors.text }]}>
                    {route.baseFuelConsumption.toFixed(1)}L
                  </Text>
                </View>

                <View>
                  <Text style={[styles.consumptionLabel, { color: colors.neutral }]}>
                    With terrain
                  </Text>
                  <Text style={[styles.consumptionValue, { color: colors.text }]}>
                    {route.adjustedFuelConsumption.toFixed(1)}L (+{route.terrainPenalty.toFixed(1)}%)
                  </Text>
                </View>

                <View
                  style={[
                    styles.terrainBadge,
                    {
                      backgroundColor: getTerrainColor(route.terrainDifficulty) + '20',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.terrainText,
                      { color: getTerrainColor(route.terrainDifficulty) },
                    ]}
                  >
                    {route.terrainDifficulty === 'flat' && '⛳'}
                    {route.terrainDifficulty === 'moderate' && '🏔️'}
                    {route.terrainDifficulty === 'hilly' && '⛰️'} {route.terrainDifficulty}
                  </Text>
                </View>
              </View>

              {/* Reason */}
              <Text
                style={[
                  styles.reasonText,
                  {
                    color: colors.neutral,
                    marginTop: 8,
                    borderTopColor: colors.border,
                    paddingTop: 8,
                    borderTopWidth: 1,
                  },
                ]}
              >
                {getRecommendationReason(route, routes)}
              </Text>

              {/* Selection Indicator */}
              {isSelected && (
                <View style={[styles.checkmark, { borderColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Consumption Factors Card */}
      <View
        style={[
          styles.consumptionFactors,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.factorsTitle, { color: colors.text }]}>
          Consumption Factors
        </Text>
        <View style={styles.factorsList}>
          <View style={styles.factorRow}>
            <Ionicons name="mountain-outline" size={16} color={colors.neutral} />
            <Text style={[styles.factorLabel, { color: colors.neutral }]}>
              Terrain: +5% per 100m elevation gain
            </Text>
          </View>
          <View style={styles.factorRow}>
            <Ionicons name="thermometer-outline" size={16} color={colors.neutral} />
            <Text style={[styles.factorLabel, { color: colors.neutral }]}>
              Weather: cold/wind modifiers applied
            </Text>
          </View>
          <View style={styles.factorRow}>
            <Ionicons name="car-outline" size={16} color={colors.neutral} />
            <Text style={[styles.factorLabel, { color: colors.neutral }]}>
              Vehicle: {baseFuelEfficiency.toFixed(1)} L/100km base
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  routesContainer: {
    gap: 12,
  },
  routeCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    position: 'relative',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  routeLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  consumptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  consumptionLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  consumptionValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  terrainBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  terrainText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reasonText: {
    fontSize: 12,
  },
  checkmark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  consumptionFactors: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  factorsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  factorsList: {
    gap: 8,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  factorLabel: {
    fontSize: 12,
    flex: 1,
  },
});

export default RoutePickerScreen;
