import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { subscribeToActiveTrip, subscribeToRiders } from '../../../services/trips';
import { subscribeToExpenses } from '../../../services/expenses';
import {
  requestPayment as callRequestPayment,
  confirmPayment as callConfirmPayment,
  sendPaymentReminder as callSendReminder,
  subscribeToPaymentRequests,
} from '../../../services/payment';
import type { TripDoc, RiderDoc, ExpenseDoc, PaymentRequestDoc } from '../../../types/firestore';

type Category = ExpenseDoc['category'];

interface CategoryBreakdown {
  gas: number;
  toll: number;
  parking: number;
  other: number;
}

interface RiderSummary {
  rider: RiderDoc;
  breakdown: CategoryBreakdown;
  balance: number;
  isPaid: boolean;
}

const CATEGORY_META: { key: Category; label: string; icon: string }[] = [
  { key: 'gas', label: 'Fuel', icon: 'flame-outline' },
  { key: 'toll', label: 'Toll', icon: 'card-outline' },
  { key: 'parking', label: 'Parking', icon: 'car-outline' },
  { key: 'other', label: 'Meals', icon: 'fast-food-outline' },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function computeBreakdowns(
  riders: RiderDoc[],
  expenses: ExpenseDoc[],
): Map<string, CategoryBreakdown> {
  const map = new Map<string, CategoryBreakdown>();
  for (const rider of riders) {
    map.set(rider.userId, { gas: 0, toll: 0, parking: 0, other: 0 });
  }
  for (const expense of expenses) {
    for (const [riderId, share] of Object.entries(expense.splits)) {
      const bd = map.get(riderId);
      if (bd) bd[expense.category] += share;
    }
  }
  return map;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function SplitsScreen() {
  const user = useAuthStore((s) => s.user);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [activeTrip, setActiveTrip] = useState<TripDoc | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [loadingTrip, setLoadingTrip] = useState(true);

  // Payment state
  const [pendingRequest, setPendingRequest] = useState<PaymentRequestDoc | null>(null);
  const [requestingFor, setRequestingFor] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [remindingFor, setRemindingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToActiveTrip(user.uid, (trip, id) => {
      setActiveTrip(trip);
      setActiveTripId(id);
      setLoadingTrip(false);
    });
  }, [user]);

  useEffect(() => {
    if (!activeTripId) {
      setRiders([]);
      setExpenses([]);
      return;
    }
    const unsubRiders = subscribeToRiders(activeTripId, setRiders);
    const unsubExpenses = subscribeToExpenses(activeTripId, setExpenses);
    return () => {
      unsubRiders();
      unsubExpenses();
    };
  }, [activeTripId]);

  // Subscribe to pending payment requests directed at this user (rider view)
  useEffect(() => {
    if (!activeTripId || !user) return;
    return subscribeToPaymentRequests(activeTripId, user.uid, (reqs) => {
      setPendingRequest(reqs[0] ?? null);
    });
  }, [activeTripId, user]);

  const isDriver = activeTrip?.ownerId === user?.uid;

  const summaries = useMemo<RiderSummary[]>(() => {
    if (!riders.length) return [];
    const breakdowns = computeBreakdowns(riders, expenses);
    return riders.map((rider) => {
      const breakdown = breakdowns.get(rider.userId) ?? {
        gas: 0, toll: 0, parking: 0, other: 0,
      };
      const balance = Math.max(0, rider.amountOwed - rider.amountPaid);
      return { rider, breakdown, balance, isPaid: balance < 0.01 };
    });
  }, [riders, expenses]);

  const driverIncoming = useMemo(() => {
    if (!isDriver || !user) return null;
    const others = summaries.filter((s) => s.rider.userId !== user.uid);
    const outstanding = others.reduce((acc, s) => acc + s.balance, 0);
    const pendingCount = others.filter((s) => !s.isPaid).length;
    return { outstanding, pendingCount, total: others.length };
  }, [summaries, isDriver, user]);

  const sortedSummaries = useMemo(() => {
    return [...summaries].sort((a, b) => {
      if (a.rider.userId === user?.uid) return -1;
      if (b.rider.userId === user?.uid) return 1;
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      return b.balance - a.balance;
    });
  }, [summaries, user?.uid]);

  async function handleRequestPayment(riderId: string) {
    if (!activeTripId) return;
    setRequestingFor(riderId);
    try {
      await callRequestPayment(activeTripId, riderId);
    } catch {
      Alert.alert('Error', 'Could not send payment request. Please try again.');
    } finally {
      setRequestingFor(null);
    }
  }

  async function handleSendReminder(riderId: string) {
    if (!activeTripId) return;
    setRemindingFor(riderId);
    try {
      await callSendReminder(activeTripId, riderId);
      Alert.alert('Reminder sent', 'The rider has been notified.');
    } catch {
      Alert.alert('Error', 'Could not send reminder. Please try again.');
    } finally {
      setRemindingFor(null);
    }
  }

  async function handlePay() {
    if (!pendingRequest || !activeTripId) return;
    setPaying(true);
    try {
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: pendingRequest.clientSecret,
        merchantDisplayName: 'FuelEquity',
        applePay: { merchantCountryCode: 'US' },
        style: 'alwaysDark',
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message);
        }
        return;
      }

      await callConfirmPayment(activeTripId, pendingRequest.requestId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Please try again.';
      Alert.alert('Payment error', message);
    } finally {
      setPaying(false);
    }
  }

  // ── Loading ──
  if (loadingTrip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header />
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── No trip ──
  if (!activeTrip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header />
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No active trip</Text>
          <Text style={styles.emptyBody}>Start or join a trip to track expense splits.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Trip badge */}
        <View style={styles.tripBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.tripBadgeText} numberOfLines={1}>
            {activeTrip.name}
          </Text>
        </View>

        {/* Driver collection banner */}
        {isDriver && driverIncoming && driverIncoming.total > 0 && (
          <View style={styles.collectionBanner}>
            <View>
              <Text style={styles.collectionLabel}>Still to collect</Text>
              <Text style={styles.collectionAmount}>
                ${driverIncoming.outstanding.toFixed(2)}
              </Text>
              <Text style={styles.collectionSub}>
                {driverIncoming.pendingCount} of {driverIncoming.total}{' '}
                {driverIncoming.total === 1 ? 'rider' : 'riders'} pending
              </Text>
            </View>
            <View style={styles.walletCircle}>
              <Ionicons name="wallet-outline" size={26} color={Colors.textInverse} />
            </View>
          </View>
        )}

        {/* Rider cards */}
        {sortedSummaries.map((summary) => {
          const isSelf = summary.rider.userId === user?.uid;
          return (
            <RiderCard
              key={summary.rider.userId}
              summary={summary}
              isSelf={isSelf}
              isDriverView={isDriver}
              onRequestPayment={() => handleRequestPayment(summary.rider.userId)}
              requesting={requestingFor === summary.rider.userId}
              onSendReminder={() => handleSendReminder(summary.rider.userId)}
              reminding={remindingFor === summary.rider.userId}
              onPay={isSelf && pendingRequest ? handlePay : undefined}
              paying={paying}
            />
          );
        })}

        {summaries.length === 0 && (
          <View style={styles.noRidersWrap}>
            <Text style={styles.noRidersText}>No riders have joined yet.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Splits</Text>
    </View>
  );
}

interface RiderCardProps {
  summary: RiderSummary;
  isSelf: boolean;
  isDriverView: boolean;
  onRequestPayment?: () => void;
  requesting?: boolean;
  onSendReminder?: () => void;
  reminding?: boolean;
  onPay?: () => void;
  paying?: boolean;
}

function RiderCard({
  summary,
  isSelf,
  isDriverView,
  onRequestPayment,
  requesting,
  onSendReminder,
  reminding,
  onPay,
  paying,
}: RiderCardProps) {
  const { rider, breakdown, balance, isPaid } = summary;
  const initials = getInitials(rider.displayName);
  const isDriver = rider.role === 'driver';
  const hasExpenses = Object.values(breakdown).some((v) => v > 0.001);
  const isRequested = !isPaid && rider.paymentStatus === 'requested';

  // Driver sees "Request Payment" on unpaid passenger cards (not already requested)
  const showRequestBtn = isDriverView && !isSelf && !isDriver && !isPaid && !isRequested;
  // Driver sees "Send Reminder" once a payment request has been sent but not paid
  const showReminderBtn = isDriverView && !isSelf && !isDriver && isRequested;
  // Rider sees "Pay" on their own card when a payment request is pending
  const showPayBtn = isSelf && isRequested && !!onPay;

  return (
    <View style={[styles.card, isSelf && styles.cardSelf]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, isDriver && styles.avatarDriver]}>
          <Text style={[styles.avatarText, isDriver && styles.avatarTextDriver]}>
            {initials}
          </Text>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {rider.displayName}
            </Text>
            {isSelf && <Text style={styles.youBadge}>You</Text>}
            {isDriver && <Text style={styles.driverBadge}>Driver</Text>}
          </View>
          <Text style={styles.cardTotal}>
            Total share: ${rider.amountOwed.toFixed(2)}
          </Text>
        </View>

        <View style={[
          styles.statusPill,
          isPaid ? styles.pillPaid : isRequested ? styles.pillRequested : styles.pillPending,
        ]}>
          <Text style={[
            styles.statusText,
            isPaid ? styles.statusPaid : isRequested ? styles.statusRequested : styles.statusPending,
          ]}>
            {isPaid ? 'Paid' : isRequested ? 'Requested' : `Owes $${balance.toFixed(2)}`}
          </Text>
        </View>
      </View>

      {/* Itemized breakdown */}
      {hasExpenses && (
        <View style={styles.breakdown}>
          <View style={styles.breakdownDivider} />
          {CATEGORY_META.filter(({ key }) => breakdown[key] > 0.001).map(({ key, label, icon }) => (
            <View key={key} style={styles.breakdownRow}>
              <Ionicons
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                name={icon as any}
                size={13}
                color={Colors.textMuted}
                style={styles.breakdownIcon}
              />
              <Text style={styles.breakdownLabel}>{label}</Text>
              <Text style={styles.breakdownAmount}>${breakdown[key].toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Driver: Request Payment button */}
      {showRequestBtn && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onRequestPayment}
          disabled={requesting}
          activeOpacity={0.75}
        >
          {requesting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="send-outline" size={14} color={Colors.primary} />
              <Text style={styles.actionBtnText}>Request Payment</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Driver: Send Reminder button (after payment already requested) */}
      {showReminderBtn && (
        <TouchableOpacity
          style={styles.reminderBtn}
          onPress={onSendReminder}
          disabled={reminding}
          activeOpacity={0.75}
        >
          {reminding ? (
            <ActivityIndicator size="small" color={Colors.textMuted} />
          ) : (
            <>
              <Ionicons name="notifications-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.reminderBtnText}>Send Reminder</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Rider: Apple Pay button */}
      {showPayBtn && (
        <TouchableOpacity
          style={[styles.payBtn, paying && styles.payBtnDisabled]}
          onPress={onPay}
          disabled={paying}
          activeOpacity={0.8}
        >
          {paying ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : (
            <>
              <Ionicons name="logo-apple" size={15} color={Colors.textInverse} />
              <Text style={styles.payBtnText}>Pay ${balance.toFixed(2)} with Apple Pay</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },

  header: {
    alignItems: 'center',
    justifyContent: 'center',
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

  scroll: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },

  // Trip badge
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  tripBadgeText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // Driver collection banner
  collectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
    ...Shadow.md,
  },
  collectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: Spacing.xxs,
  },
  collectionAmount: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
  },
  collectionSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.xxs,
  },
  walletCircle: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.green,
  },

  // Rider card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardSelf: {
    borderColor: Colors.primaryMuted,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    gap: Spacing.md,
  },

  // Avatar
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarDriver: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySubtle,
  },
  avatarText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  avatarTextDriver: {
    color: Colors.primary,
  },

  // Card meta
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  cardName: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    flexShrink: 1,
  },
  youBadge: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  driverBadge: {
    color: Colors.textInverse,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  cardTotal: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  // Status pill
  statusPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xxs + 2,
    flexShrink: 0,
  },
  pillPaid: {
    backgroundColor: Colors.paidBg,
  },
  pillPending: {
    backgroundColor: Colors.pendingBg,
  },
  pillRequested: {
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  statusPaid: {
    color: Colors.paid,
  },
  statusPending: {
    color: Colors.pending,
  },
  statusRequested: {
    color: '#60a5fa',
  },

  // Breakdown
  breakdown: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  breakdownIcon: {
    marginRight: Spacing.xs,
  },
  breakdownLabel: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  breakdownAmount: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // Payment action buttons
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primaryMuted,
    backgroundColor: Colors.primarySubtle,
    minHeight: 36,
  },
  actionBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    minHeight: 36,
  },
  reminderBtnText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
    minHeight: 40,
    ...Shadow.sm,
  },
  payBtnDisabled: {
    opacity: 0.6,
  },
  payBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },

  // Empty states
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  emptyBody: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xxl,
    lineHeight: 20,
  },
  noRidersWrap: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  noRidersText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});
