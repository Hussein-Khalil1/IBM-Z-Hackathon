import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { getNearbyGasPrices, GasStation, formatGasPrice } from '../../../services/gasPrices';

interface GasStationWithTrend extends GasStation {
  trend: 'up' | 'down' | 'flat';
  trendPercent: number;
}

export default function GasPricesScreen() {
  const [stations, setStations] = useState<GasStationWithTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Animated "live" indicator pulse
  useEffect(() => {
    if (!loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
        ]),
      ).start();
    }
  }, [loading, pulseAnim]);

  const fetchGasPrices = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      const response = await getNearbyGasPrices(latitude, longitude, 5);

      // Add mock trend data (in production, this would come from historical data)
      const stationsWithTrend: GasStationWithTrend[] = response.stations.map((station) => {
        const trends = ['up', 'down', 'flat'] as const;
        const trend = trends[Math.floor(Math.random() * 3)];
        const trendPercent = Math.random() * 5;

        return {
          ...station,
          trend,
          trendPercent,
        };
      });

      setStations(stationsWithTrend);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching gas prices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGasPrices();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchGasPrices();
  };

  const getPriceColor = (price: number, allPrices: number[]) => {
    if (allPrices.length === 0) return Colors.primary;
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const range = max - min;

    if (price <= min + range * 0.33) return '#4ade80'; // green - cheap
    if (price <= min + range * 0.66) return '#fbbf24'; // amber - mid
    return '#ef4444'; // red - expensive
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
    if (trend === 'up') return '▲';
    if (trend === 'down') return '▼';
    return '─';
  };

  const renderStation = ({ item }: { item: GasStationWithTrend }) => {
    const priceColor = getPriceColor(item.pricePerLitre, stations.map((s) => s.pricePerLitre));

    return (
      <TouchableOpacity style={[styles.stationCard, Shadow.md]} activeOpacity={0.7}>
        <View style={styles.stationHeader}>
          <View style={styles.brandLogo}>
            <Text style={styles.brandText}>{item.brand?.slice(0, 1) || '⛽'}</Text>
          </View>
          <View style={styles.stationInfo}>
            <Text style={styles.stationName}>{item.name}</Text>
            <Text style={styles.distance}>{item.distance.toFixed(1)} km away</Text>
          </View>
          <View style={styles.priceSection}>
            <Text style={[styles.price, { color: priceColor }]}>{formatGasPrice(item.pricePerLitre)}</Text>
            <Text style={[styles.trend, { color: item.trend === 'up' ? '#ef4444' : item.trend === 'down' ? '#4ade80' : Colors.textMuted }]}>
              {getTrendIcon(item.trend)} {item.trendPercent.toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>
            Last updated: {new Date(item.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Finding nearby stations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gas Prices Near You</Text>
        <Animated.View style={[styles.liveIndicator, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </Animated.View>
      </View>

      {lastUpdated && (
        <Text style={styles.lastUpdated}>
          Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}

      <FlatList
        data={stations}
        renderItem={renderStation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="gas-pump-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No gas stations found nearby</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: Spacing.xs,
  },
  liveText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.primary,
  },
  lastUpdated: {
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  stationCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  brandLogo: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  brandText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  distance: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  trend: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  timeRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  timeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
});
