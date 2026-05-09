import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { db } from '../../../services/firebase';
import { subscribeToRiders } from '../../../services/trips';
import { useAuthStore } from '../../../store/authStore';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../../theme';
import type { HomeStackParamList } from '../types';
import type { TripDoc, RiderDoc } from '../../../types/firestore';

type Props = NativeStackScreenProps<HomeStackParamList, 'TripDetail'>;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function hasPaid(rider: RiderDoc): boolean {
  return rider.amountOwed > 0 && rider.amountPaid >= rider.amountOwed;
}

function RiderRow({ rider }: { rider: RiderDoc }) {
  const paid = hasPaid(rider);
  const pending = rider.amountOwed > 0 && !paid;
  return (
    <View style={styles.riderRow}>
      <View style={styles.riderLeft}>
        <View style={[styles.avatar, rider.role === 'driver' && styles.avatarDriver]}>
          <Text style={[styles.avatarText, rider.role === 'driver' && styles.avatarTextDriver]}>
            {getInitials(rider.displayName)}
          </Text>
        </View>
        <View>
          <Text style={styles.riderName}>{rider.displayName}</Text>
          <Text style={styles.riderRole}>{rider.role === 'driver' ? 'Driver' : 'Passenger'}</Text>
        </View>
      </View>
      <View style={styles.riderRight}>
        {paid ? (
          <View style={styles.paidBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.paid} />
            <Text style={styles.paidText}>Paid</Text>
          </View>
        ) : pending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>${rider.amountOwed.toFixed(2)}</Text>
            <Text style={styles.owedLabel}> owed</Text>
          </View>
        ) : (
          <Text style={styles.noOwedText}>—</Text>
        )}
      </View>
    </View>
  );
}

export default function TripDetailScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const user = useAuthStore((s) => s.user);
  const [trip, setTrip] = useState<TripDoc | null>(null);
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'trips', tripId)).then((snap) => {
      if (snap.exists()) setTrip(snap.data() as TripDoc);
      setLoading(false);
    });
  }, [tripId]);

  useEffect(() => {
    return subscribeToRiders(tripId, setRiders);
  }, [tripId]);

  const isDriver = trip?.ownerId === user?.uid;
  const perPerson =
    trip && trip.riderIds.length > 0 ? trip.totalCost / trip.riderIds.length : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {trip?.name ?? 'Trip'}
        </Text>
        {isDriver ? (
          <TouchableOpacity onPress={() => navigation.navigate('TripLobby', { tripId })} hitSlop={12}>
            <Ionicons name="person-add-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <Ionicons name="location-outline" size={15} color={Colors.primary} />
            <Text style={styles.routeText}> {trip?.origin}</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} style={{ marginHorizontal: 6 }} />
            <Text style={styles.routeText}>{trip?.destination}</Text>
          </View>
          <View style={styles.routeRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.dateText}> {trip?.date}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>COST SUMMARY</Text>
        <View style={styles.costCard}>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Total</Text>
            <Text style={styles.costValue}>${trip?.totalCost.toFixed(2) ?? '0.00'}</Text>
          </View>
          <View style={[styles.costRow, styles.costRowBorder]}>
            <Text style={styles.costLabel}>Per person</Text>
            <Text style={[styles.costValue, styles.perPersonValue]}>${perPerson.toFixed(2)}</Text>
          </View>
          <View style={[styles.costRow, styles.costRowBorder]}>
            <Text style={styles.costLabel}>Riders</Text>
            <Text style={styles.costValue}>{trip?.riderIds.length ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>RIDERS · {riders.length}</Text>
        <View style={styles.ridersCard}>
          {riders.length === 0 ? (
            <Text style={styles.emptyText}>No riders yet</Text>
          ) : (
            riders.map((r, i) => (
              <View key={r.userId} style={i > 0 && styles.riderDivider}>
                <RiderRow rider={r} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl },

  routeCard: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  routeText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  dateText: { color: Colors.textMuted, fontSize: FontSize.sm },

  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },

  costCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  costRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  costLabel: { color: Colors.textSecondary, fontSize: FontSize.base },
  costValue: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  perPersonValue: { color: Colors.primary },

  ridersCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  riderDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  riderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  riderRight: { alignItems: 'flex-end' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDriver: { borderColor: Colors.primary, backgroundColor: Colors.primarySubtle },
  avatarText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  avatarTextDriver: { color: Colors.primary },
  riderName: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  riderRole: { color: Colors.textMuted, fontSize: FontSize.xs },

  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  paidText: { color: Colors.paid, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  pendingBadge: { flexDirection: 'row', alignItems: 'center' },
  pendingText: { color: Colors.pending, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  owedLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  noOwedText: { color: Colors.textMuted, fontSize: FontSize.base },

  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});
