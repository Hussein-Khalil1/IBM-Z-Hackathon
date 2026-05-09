import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { getUserProfile } from '../../../services/profile';
import { getTripByInviteCode, joinTrip } from '../../../services/trips';
import type { HomeStackParamList } from '../types';
import type { TripDoc } from '../../../types/firestore';

type Props = NativeStackScreenProps<HomeStackParamList, 'JoinTrip'>;

export default function JoinTripScreen({ navigation, route }: Props) {
  const user = useAuthStore((s) => s.user);
  const [codeInput, setCodeInput] = useState(route.params?.code?.toUpperCase() ?? '');
  const [trip, setTrip] = useState<{ id: string; data: TripDoc } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (route.params?.code) lookupTrip(route.params.code);
  }, [route.params?.code]);

  const lookupTrip = async (code: string) => {
    if (!code.trim()) return;
    setLookupLoading(true);
    try {
      const result = await getTripByInviteCode(code.trim());
      if (!result) {
        Alert.alert('Not found', 'No trip found with that code. Check the code and try again.');
      } else {
        setTrip(result);
      }
    } catch {
      Alert.alert('Error', 'Could not look up trip. Check your connection.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !trip) return;
    if (trip.data.riderIds.includes(user.uid)) {
      navigation.replace('TripLobby', { tripId: trip.id });
      return;
    }
    setJoining(true);
    try {
      const profile = await getUserProfile(user.uid);
      const displayName = profile?.displayName ?? user.displayName ?? 'Rider';
      await joinTrip(trip.id, user.uid, displayName);
      navigation.replace('TripLobby', { tripId: trip.id });
    } catch {
      Alert.alert('Error', 'Could not join trip. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join Trip</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {!trip ? (
          <>
            <Text style={styles.prompt}>Enter the 6-character invite code</Text>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={(v) => setCodeInput(v.toUpperCase())}
              placeholder="A B C 1 2 3"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (lookupLoading || codeInput.length < 6) && styles.btnDisabled]}
              onPress={() => lookupTrip(codeInput)}
              disabled={lookupLoading || codeInput.length < 6}
              activeOpacity={0.85}
            >
              {lookupLoading ? (
                <ActivityIndicator color={Colors.textInverse} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Find Trip</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.tripCard}>
              <Text style={styles.tripName}>{trip.data.name}</Text>
              <View style={styles.row}>
                <Ionicons name="location-outline" size={14} color={Colors.primary} />
                <Text style={styles.routeText}> {trip.data.origin}</Text>
                <Ionicons
                  name="arrow-forward"
                  size={13}
                  color={Colors.textMuted}
                  style={{ marginHorizontal: 6 }}
                />
                <Text style={styles.routeText}>{trip.data.destination}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.metaText}> {trip.data.date}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="person-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.metaText}> Driver: {trip.data.ownerDisplayName}</Text>
              </View>
              <View style={styles.row}>
                <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.metaText}>
                  {' '}
                  {trip.data.riderIds.length} rider{trip.data.riderIds.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, joining && styles.btnDisabled]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.85}
            >
              {joining ? (
                <ActivityIndicator color={Colors.textInverse} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Join Trip</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={() => {
                setTrip(null);
                setCodeInput('');
              }}
            >
              <Text style={styles.ghostBtnText}>Use a different code</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xxl,
  },
  prompt: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  codeInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    color: Colors.primary,
    fontSize: 28,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    letterSpacing: 10,
    marginBottom: Spacing.xl,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    ...Shadow.green,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },

  tripCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  tripName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  routeText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  metaText: { color: Colors.textMuted, fontSize: FontSize.sm },

  ghostBtn: {
    alignItems: 'center',
    marginTop: Spacing.md,
    padding: Spacing.sm,
  },
  ghostBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
