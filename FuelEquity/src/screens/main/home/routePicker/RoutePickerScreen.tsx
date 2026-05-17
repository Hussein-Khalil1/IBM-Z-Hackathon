import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { compareRoutes, RouteOption, Location } from '../../../services/routes';

type Props = NativeStackScreenProps<any, 'RoutePicker'>;

interface RoutePickerProps {
  origin: Location;
  destination: Location;
  baseFuelEfficiency: number;
  gasPrice: number;
  onSelectRoute: (route: RouteOption) => void;
}

export default function RoutePickerScreen({ route, navigation }: Props) {
  const params = route.params as RoutePickerProps;
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [recommended, setRecommended] = useState<RouteOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const result = await compareRoutes({
          origin: params.origin,
          destination: params.destination,
          baseFuelEfficiency: params.baseFuelEfficiency,
          gasPrice: params.gasPrice,
        });

        setRoutes(result.routes);
        setRecommended(result.recommended);
      } catch (error) {
        console.error('Error fetching routes:', error);
        Alert.alert('Error', 'Failed to load route options');
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, []);

  const handleSelectRoute = (route: RouteOption) => {
    setSelectedId(route.id);
    setTimeout(() => {
      params.onSelectRoute(route);
      navigation.goBack();
    }, 300);
  };

  const getTerrainBadge = (difficulty: string) => {
    const badgeStyle = {
      flat: { backgroundColor: '#4ade80', label: '🟢 Flat' },
      moderate: { backgroundColor: '#fbbf24', label: '🟡 Moderate' },
      hilly: { backgroundColor: '#ef4444', label: '🔴 Hilly' },
    }[difficulty] || { backgroundColor: Colors.border, label: difficulty };

    return badgeStyle;
  };

  const renderRoute = (route: RouteOption, isRecommended: boolean) => {
    const isSelected = selectedId === route.id;
    const terrainBadge = getTerrainBadge(route.terrainDifficulty);

    return (
      <TouchableOpacity
        key={route.id}
        style={[
          styles.routeCard,
          Shadow.md,
          isSelected && styles.routeCardSelected,
          isRecommended && styles.routeCardRecommended,
        ]}
        onPress={() => handleSelectRoute(route)}
        activeOpacity={0.8}
      >
        {isRecommended && (
          <View style={styles.recommendedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="white" />
            <Text style={styles.recommendedText}>Recommended</Text>
          </View>
        )}

        {isSelected && (
          <View style={styles.selectedCheck}>
            <Ionicons name="checkmark" size={24} color={Colors.primary} />
          </View>
        )}

        <Text style={styles.routeLabel}>{route.label}</Text>

        <View style={styles.routeMetrics}>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricValue}>{route.distanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Duration</Text>
              <Text style={styles.metricValue}>{route.durationMinutes} min</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Fuel Needed</Text>
              <Text style={styles.metricValue}>{route.adjustedFuelConsumption.toFixed(1)}L</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Est. Cost</Text>
              <Text style={[styles.metricValue, styles.costValue]}>
                ${route.fuelCostCAD.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.terrainRow}>
          <View style={[styles.terrainBadge, { backgroundColor: terrainBadge.backgroundColor }]}>
            <Text style={styles.terrainLabel}>{terrainBadge.label}</Text>
          </View>
          <Text style={styles.elevationText}>+{route.elevationGainM}m elevation</Text>
        </View>

        <View style={styles.penaltyRow}>
          <Text style={styles.penaltyLabel}>Terrain Penalty:</Text>
          <Text style={styles.penaltyValue}>+{route.terrainPenalty.toFixed(1)}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Calculating routes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Choose Your Route</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.subtitle}>
          Select the route that works best for your trip
        </Text>

        <View style={styles.routesContainer}>
          {routes.map((route) => renderRoute(route, route.id === recommended?.id))}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color={Colors.primary} />
          <Text style={styles.infoText}>
            The recommended eco route minimizes fuel cost while maintaining reasonable travel time.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingVertical: Spacing.md,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  routesContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  routeCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
    position: 'relative',
  },
  routeCardRecommended: {
    borderColor: '#4ade80',
    backgroundColor: `${Colors.surface}cc`,
  },
  routeCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ade80',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  recommendedText: {
    color: 'white',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    marginLeft: Spacing.xs,
  },
  selectedCheck: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
  },
  routeLabel: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  routeMetrics: {
    marginBottom: Spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  metricValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  costValue: {
    color: Colors.primary,
  },
  terrainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  terrainBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  terrainLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: 'white',
  },
  elevationText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  penaltyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  penaltyLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  penaltyValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  infoBox: {
    marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.md,
    flex: 1,
  },
});
