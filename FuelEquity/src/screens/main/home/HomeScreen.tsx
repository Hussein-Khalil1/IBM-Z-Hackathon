import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { subscribeToActiveTrip, subscribeToRiders } from '../../../services/trips';
import type { HomeStackParamList } from '../types';
import type { TripDoc, RiderDoc } from '../../../types/firestore';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeScreen'>;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function hasPaid(rider: RiderDoc): boolean {
  return rider.amountOwed > 0 && rider.amountPaid >= rider.amountOwed;
}

function RiderPip({ rider }: { rider: RiderDoc }) {
  const paid = hasPaid(rider);
  return (
    <View style={styles.pipWrap}>
      <View style={[styles.pip, rider.role === 'driver' && styles.pipDriver]}>
        <Text style={[styles.pipText, rider.role === 'driver' && styles.pipTextDriver]}>
          {getInitials(rider.displayName)}
        </Text>
      </View>
      {paid && (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark" size={8} color={Colors.textInverse} />
        </View>
      )}
    </View>
  );
}

function ActiveTripCard({
  trip,
  tripId,
  riders,
}: {
  trip: TripDoc;
  tripId: string;
  riders: RiderDoc[];
}) {
  const navigation = useNavigation<Nav>();
  const perPerson = trip.riderIds.length > 0 ? trip.totalCost / trip.riderIds.length : 0;

  return (
    <TouchableOpacity
      style={styles.tripCard}
      onPress={() => navigation.navigate('TripDetail', { tripId })}
      activeOpacity={0.85}
    >
      <View style={styles.tripCardHeader}>
        <View style={styles.activeDot} />
        <Text style={styles.activeLabel}>ACTIVE TRIP</Text>
      </View>

      <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>

      <View style={styles.routeRow}>
        <Ionicons name="location-outline" size={13} color={Colors.primary} />
        <Text style={styles.routeText} numberOfLines={1}>
          {' '}{trip.origin}
        </Text>
        <Ionicons name="arrow-forward" size={12} color={Colors.textMuted} style={{ marginHorizontal: 5 }} />
        <Text style={styles.routeText} numberOfLines={1}>{trip.destination}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.tripCardFooter}>
        <View style={styles.costSection}>
          <Text style={styles.costTotal}>${trip.totalCost.toFixed(2)}</Text>
          <Text style={styles.costSub}>
            ${perPerson.toFixed(2)} / person
          </Text>
        </View>

        <View style={styles.ridersSection}>
          {riders.slice(0, 5).map((r) => (
            <RiderPip key={r.userId} rider={r} />
          ))}
          {riders.length > 5 && (
            <View style={styles.extraPip}>
              <Text style={styles.extraText}>+{riders.length - 5}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>Tap for details</Text>
        <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  const navigation = useNavigation<Nav>();
  return (
    <View style={styles.emptyCard}>
      <Ionicons name="car-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No active trip</Text>
      <Text style={styles.emptyBody}>Create a trip to start splitting fuel costs with your riders.</Text>
      <View style={styles.emptyActions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('CreateTrip')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={17} color={Colors.textInverse} style={{ marginRight: 7 }} />
          <Text style={styles.primaryBtnText}>New Trip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.navigate('JoinTrip', {})}
          activeOpacity={0.85}
        >
          <Ionicons name="enter-outline" size={17} color={Colors.primary} style={{ marginRight: 7 }} />
          <Text style={styles.outlineBtnText}>Join Trip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripDoc | null>(null);
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [loadingTrip, setLoadingTrip] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToActiveTrip(user.uid, (trip, id) => {
      setActiveTrip(trip);
      setActiveTripId(id);
      setLoadingTrip(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!activeTripId) {
      setRiders([]);
      return;
    }
    return subscribeToRiders(activeTripId, setRiders);
  }, [activeTripId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>FuelEquity</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} hitSlop={12}>
          <Ionicons name="person-circle-outline" size={28} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loadingTrip ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : activeTrip && activeTripId ? (
          <ActiveTripCard trip={activeTrip} tripId={activeTripId} riders={riders} />
        ) : (
          <EmptyState />
        )}

        {/* Quick actions when a trip is active */}
        {!loadingTrip && activeTrip && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('CreateTrip')}
              activeOpacity={0.85}
            >
              <Ionicons name="add-outline" size={18} color={Colors.primary} />
              <Text style={styles.quickBtnText}>New Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('JoinTrip', {})}
              activeOpacity={0.85}
            >
              <Ionicons name="enter-outline" size={18} color={Colors.primary} />
              <Text style={styles.quickBtnText}>Join Trip</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  title: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl, flexGrow: 1 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // Active trip card
  tripCard: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    ...Shadow.md,
  },
  tripCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    marginRight: 6,
  },
  activeLabel: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
  },
  tripName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 6,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  routeText: { color: Colors.textSecondary, fontSize: FontSize.sm, flexShrink: 1 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },
  tripCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  costSection: { gap: 2 },
  costTotal: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  costSub: { color: Colors.textMuted, fontSize: FontSize.sm },
  ridersSection: { flexDirection: 'row', alignItems: 'center', gap: -8 },
  pipWrap: { position: 'relative', marginLeft: -8 },
  pip: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipDriver: { backgroundColor: Colors.primarySubtle, borderColor: Colors.primary },
  pipText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  pipTextDriver: { color: Colors.primary },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  extraPip: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  extraText: { color: Colors.textMuted, fontSize: 10, fontWeight: FontWeight.semibold },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
    gap: 2,
  },
  tapHintText: { color: Colors.textMuted, fontSize: FontSize.xs },

  // Empty state
  emptyCard: {
    marginTop: Spacing.xxl,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.sm,
  },
  emptyBody: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  emptyActions: { width: '100%', gap: Spacing.md },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.green,
  },
  primaryBtnText: { color: Colors.textInverse, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  outlineBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { color: Colors.primary, fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  // Quick actions (shown when trip is active)
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  quickBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
