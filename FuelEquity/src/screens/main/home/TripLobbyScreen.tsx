import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { db } from '../../../services/firebase';
import { subscribeToRiders } from '../../../services/trips';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../../theme';
import type { HomeStackParamList } from '../types';
import type { TripDoc, RiderDoc } from '../../../types/firestore';

type Props = NativeStackScreenProps<HomeStackParamList, 'TripLobby'>;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function RiderAvatar({ rider }: { rider: RiderDoc }) {
  const isDriver = rider.role === 'driver';
  return (
    <View style={styles.avatarWrap}>
      <View style={[styles.riderAvatar, isDriver && styles.riderAvatarDriver]}>
        <Text style={[styles.riderInitials, isDriver && styles.riderInitialsDriver]}>
          {getInitials(rider.displayName)}
        </Text>
      </View>
      {isDriver && (
        <View style={styles.driverBadge}>
          <Ionicons name="car" size={10} color={Colors.textInverse} />
        </View>
      )}
      <Text style={styles.riderName} numberOfLines={1}>
        {rider.displayName.split(' ')[0]}
      </Text>
    </View>
  );
}

export default function TripLobbyScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
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

  const handleShare = async () => {
    if (!trip) return;
    await Share.share({
      message: `Join my trip "${trip.name}" on FuelEquity!\n\nInvite code: ${trip.inviteCode}\nOr tap: fuelequity://join/${trip.inviteCode}`,
    });
  };

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
        <Text style={styles.headerTitle}>Trip Lobby</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.tripCard}>
          <Text style={styles.tripName}>{trip?.name}</Text>
          <View style={styles.routeRow}>
            <Ionicons name="location-outline" size={14} color={Colors.primary} />
            <Text style={styles.routeText}> {trip?.origin}</Text>
            <Ionicons
              name="arrow-forward"
              size={13}
              color={Colors.textMuted}
              style={{ marginHorizontal: 6 }}
            />
            <Text style={styles.routeText}>{trip?.destination}</Text>
          </View>
          <View style={styles.routeRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.dateText}> {trip?.date}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>INVITE CODE</Text>
        <View style={styles.codeCard}>
          <Text style={styles.codeText}>{trip?.inviteCode}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons
            name="share-social-outline"
            size={18}
            color={Colors.textInverse}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.shareBtnText}>Share Invite</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>
          RIDERS · {riders.length}
        </Text>
        {riders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={28} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Waiting for riders to join…</Text>
          </View>
        ) : (
          <View style={styles.ridersGrid}>
            {riders.map((r) => (
              <RiderAvatar key={r.userId} rider={r} />
            ))}
          </View>
        )}
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
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl },

  tripCard: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  tripName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
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

  codeCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  codeText: {
    color: Colors.primary,
    fontSize: 34,
    fontWeight: FontWeight.bold,
    letterSpacing: 10,
  },

  shareBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },

  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm },

  ridersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  avatarWrap: { alignItems: 'center', width: 64 },
  riderAvatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarDriver: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySubtle,
  },
  riderInitials: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  riderInitialsDriver: { color: Colors.primary },
  driverBadge: {
    position: 'absolute',
    top: 0,
    right: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 4,
    textAlign: 'center',
  },
});
