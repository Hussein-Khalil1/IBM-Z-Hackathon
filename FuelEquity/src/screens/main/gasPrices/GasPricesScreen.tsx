/**
 * Gas Prices Screen (S3-02)
 * Displays nearby gas stations with live prices, trends, and distance.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Colors, Spacing, FontSize, FontWeight } from '../../../theme';
import { getNearbyGasPrices, GasStation, formatGasPrice, formatTimeSinceUpdate } from '../../../services/gasPrices';

interface GasStationRow extends GasStation {
  trend: 'up' | 'flat' | 'down';
}

export const GasPricesScreen: React.FC = () => {
  const colors = Colors;
  const spacing = Spacing;
  const { width } = useWindowDimensions();
  const [stations, setStations] = useState<GasStationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [averagePrice, setAveragePrice] = useState<number>(0);
  const [location, setLocation] = useState({ latitude: 43.6629, longitude: -79.3957 }); // Default: Toronto
  const [cacheExpiry, setCacheExpiry] = useState<number>(0);

  // Fetch gas prices on mount and location update
  useEffect(() => {
    fetchGasPrices();
  }, [location]);

  const fetchGasPrices = async () => {
    try {
      setLoading(true);
      const result = await getNearbyGasPrices(location.latitude, location.longitude, 5);

      if (result.stations.length > 0) {
        const avg =
          result.stations.reduce((sum, s) => sum + s.pricePerLitre, 0) / result.stations.length;
        setAveragePrice(avg);

        const stationsWithTrend: GasStationRow[] = result.stations.map((station) => ({
          ...station,
          trend: station.pricePerLitre > avg ? 'up' : station.pricePerLitre < avg ? 'down' : 'flat',
        }));

        setStations(stationsWithTrend);
        setCacheExpiry(result.cacheExpiry);
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to load gas prices: ${error.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGasPrices();
  };

  const renderStationCard = (item: GasStationRow) => {
    const isExpensive = item.trend === 'up';
    const isCheap = item.trend === 'down';
    const priceColor = isExpensive ? colors.error : isCheap ? colors.success : colors.neutral;

    const savings =
      stations.length > 0 ? Math.round((stations[0].pricePerLitre - item.pricePerLitre) * 100) : 0;

    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Header: Name & Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.brandSection}>
            <Text style={[styles.stationName, { color: colors.text }]}>{item.name}</Text>
            {item.brand && (
              <Text style={[styles.brand, { color: colors.neutral }]}>{item.brand}</Text>
            )}
          </View>

          {isCheap && (
            <View style={[styles.badge, { backgroundColor: colors.success + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>Cheapest</Text>
            </View>
          )}
          {isExpensive && (
            <View style={[styles.badge, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.error }]}>Pricey</Text>
            </View>
          )}
        </View>

        {/* Price & Distance Row */}
        <View style={styles.priceRow}>
          <View style={styles.priceSection}>
            <Text style={[styles.price, { color: priceColor, fontSize: 24 }]}>
              {formatGasPrice(item.pricePerLitre)}
            </Text>
            {savings > 0 && (
              <Text style={[styles.savingsText, { color: colors.success }]}>
                Save ${(savings / 100).toFixed(2)}/tank
              </Text>
            )}
          </View>

          <View style={styles.distanceSection}>
            <Text style={[styles.distance, { color: colors.neutral }]}>
              {item.distance.toFixed(1)} km
            </Text>
            <Text style={[styles.updated, { color: colors.mutedText }]}>
              {formatTimeSinceUpdate(item.lastUpdated)}
            </Text>
          </View>
        </View>

        {/* Trend Indicator */}
        <View style={styles.trendIndicator}>
          {item.trend === 'up' && (
            <Text style={[styles.trendEmoji, { color: colors.error }]}>📈 Above average</Text>
          )}
          {item.trend === 'down' && (
            <Text style={[styles.trendEmoji, { color: colors.success }]}>📉 Below average</Text>
          )}
          {item.trend === 'flat' && (
            <Text style={[styles.trendEmoji, { color: colors.neutral }]}>➡️ Average price</Text>
          )}
        </View>
      </View>
    );
  };

  if (loading && !refreshing && stations.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.neutral }]}>Loading gas prices...</Text>
        </View>
      </View>
    );
  }

  const cacheStatus = cacheExpiry ? new Date(cacheExpiry).toLocaleTimeString() : 'unknown';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Info */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gas Prices Near You</Text>
        <View style={styles.liveIndicator}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.liveText, { color: colors.success }]}>Live data</Text>
        </View>
        <Text style={[styles.avgPrice, { color: colors.neutral }]}>
          Average in area: {formatGasPrice(Math.round(averagePrice))}
        </Text>
      </View>

      {/* Stations List */}
      <FlatList
        data={stations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderStationCard(item)}
        contentContainerStyle={styles.listContent}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              No stations found nearby
            </Text>
          </View>
        }
      />

      {/* Footer with cache info */}
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={[styles.footerText, { color: colors.mutedText, fontSize: 12 }]}>
          Cache expires: {cacheStatus}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '500',
  },
  avgPrice: {
    fontSize: 12,
  },
  listContent: {
    padding: 12,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brandSection: {
    flex: 1,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  brand: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceSection: {
    flex: 1,
  },
  price: {
    fontWeight: '700',
  },
  savingsText: {
    fontSize: 12,
    marginTop: 4,
  },
  distanceSection: {
    alignItems: 'flex-end',
  },
  distance: {
    fontSize: 14,
    fontWeight: '500',
  },
  updated: {
    fontSize: 11,
    marginTop: 2,
  },
  trendIndicator: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  trendEmoji: {
    fontSize: 12,
    fontWeight: '500',
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  footerText: {
    textAlign: 'center',
  },
});

export default GasPricesScreen;
