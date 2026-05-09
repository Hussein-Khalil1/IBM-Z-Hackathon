import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { subscribeToActiveTrip } from '../../../services/trips';
import { addExpense } from '../../../services/expenses';
import { scanReceiptFromImage } from '../../../services/receiptScanner';
import type { TripDoc, ExpenseDoc } from '../../../types/firestore';

type Category = ExpenseDoc['category'];

interface CategoryOption {
  key: Category;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryOption[] = [
  { key: 'gas', label: 'Fuel', icon: 'flame-outline' },
  { key: 'toll', label: 'Toll', icon: 'card-outline' },
  { key: 'parking', label: 'Parking', icon: 'car-outline' },
  { key: 'other', label: 'Meal', icon: 'fast-food-outline' },
];

export default function AddExpenseScreen() {
  const user = useAuthStore((s) => s.user);

  const [activeTrip, setActiveTrip] = useState<TripDoc | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState<Category>('gas');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToActiveTrip(user.uid, (trip, id) => {
      setActiveTrip(trip);
      setActiveTripId(id);
      setLoadingTrip(false);
    });
    return unsub;
  }, [user]);

  const amount = parseFloat(amountText) || 0;
  const riderCount = activeTrip?.riderIds.length ?? 0;
  const perPerson = riderCount > 0 && amount > 0 ? amount / riderCount : 0;

  function handleScan() {
    Alert.alert('Scan Receipt', 'Choose a source', [
      { text: 'Camera', onPress: () => runScan('camera') },
      { text: 'Photo Library', onPress: () => runScan('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function runScan(source: 'camera' | 'library') {
    setScanning(true);
    try {
      const result = await scanReceiptFromImage(source);
      if (!result) return;
      if (result.amount > 0) setAmountText(result.amount.toFixed(2));
      if (result.category) setSelectedCategory(result.category);
      if (result.merchantName) setNote(result.merchantName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'permission_denied') {
        Alert.alert('Permission needed', 'Allow camera or photo access in Settings to scan receipts.');
      } else {
        Alert.alert('Scan failed', 'Could not read the receipt. Please enter details manually.');
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit() {
    if (!user || !activeTrip || !activeTripId) return;
    if (amount <= 0) {
      Alert.alert('Enter an amount', 'Please enter a valid expense amount.');
      return;
    }
    setSubmitting(true);
    try {
      await addExpense({
        tripId: activeTripId,
        addedByUserId: user.uid,
        category: selectedCategory,
        amount,
        description: note.trim() || undefined,
        riderIds: activeTrip.riderIds,
      });
      setAmountText('');
      setNote('');
      setSelectedCategory('gas');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2500);
    } catch {
      Alert.alert('Error', 'Failed to add expense. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingTrip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Expense</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!activeTrip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Expense</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.noTripTitle}>No active trip</Text>
          <Text style={styles.noTripBody}>Start or join a trip first to track expenses.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Expense</Text>
        </View>
        <View style={styles.center}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={36} color={Colors.textInverse} />
          </View>
          <Text style={styles.successTitle}>Expense Added</Text>
          <Text style={styles.successBody}>All riders have been updated.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Expense</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Trip context */}
          <View style={styles.tripBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.tripBadgeText} numberOfLines={1}>
              {activeTrip.name} · {riderCount} {riderCount === 1 ? 'rider' : 'riders'}
            </Text>
          </View>

          {/* Scan receipt */}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={handleScan}
            disabled={scanning}
            activeOpacity={0.8}
          >
            {scanning ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={20} color={Colors.primary} />
                <Text style={styles.scanBtnText}>Scan Receipt</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Category picker */}
          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory(cat.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    name={cat.icon as any}
                    size={22}
                    color={active ? Colors.textInverse : Colors.textSecondary}
                  />
                  <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount input */}
          <Text style={styles.sectionLabel}>AMOUNT</Text>
          <View style={styles.amountCard}>
            <View style={styles.amountRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amountText}
                onChangeText={setAmountText}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            {perPerson > 0 && (
              <View style={styles.perPersonRow}>
                <View style={styles.perPersonDivider} />
                <Text style={styles.perPersonText}>
                  ${perPerson.toFixed(2)} / person
                </Text>
              </View>
            )}
          </View>

          {/* Note */}
          <Text style={styles.sectionLabel}>
            NOTE <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.noteCard}>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder='e.g. "Tim Hortons on Hwy 401"'
              placeholderTextColor={Colors.textMuted}
              returnKeyType="done"
              maxLength={120}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || amount <= 0) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || amount <= 0}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.textInverse} size="small" />
            ) : (
              <>
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={amount > 0 ? Colors.textInverse : Colors.textMuted}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.submitText, amount <= 0 && styles.submitTextDisabled]}>
                  Add Expense
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  header: {
    flexDirection: 'row',
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
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl },

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

  // Scan button
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    backgroundColor: Colors.primarySubtle,
  },
  scanBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // Section label
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  optional: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Category chips
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  categoryChip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...Shadow.green,
  },
  categoryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  categoryLabelActive: {
    color: Colors.textInverse,
  },

  // Amount
  amountCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  dollarSign: {
    color: Colors.textSecondary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.semibold,
    marginRight: Spacing.xs,
  },
  amountInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    paddingVertical: 0,
  },
  perPersonRow: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  perPersonDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  perPersonText: {
    color: Colors.primary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },

  // Note
  noteCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  noteInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    paddingVertical: 0,
    minHeight: 44,
  },

  // Submit button
  submitBtn: {
    marginTop: Spacing.xxl,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.green,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  submitTextDisabled: {
    color: Colors.textMuted,
  },

  // No active trip
  noTripTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.sm,
  },
  noTripBody: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xxl,
    lineHeight: 20,
  },

  // Success state
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.green,
  },
  successTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.md,
  },
  successBody: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});
