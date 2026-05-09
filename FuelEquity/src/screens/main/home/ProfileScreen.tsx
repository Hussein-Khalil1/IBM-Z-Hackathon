import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { getUserProfile, upsertUserProfile } from '../../../services/profile';
import type { HomeStackParamList } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Profile'>;

const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'MXN'];

interface NotifPrefs {
  newExpense: boolean;
  paymentRequested: boolean;
  paymentReceived: boolean;
  reminder: boolean;
}

interface ProfileForm {
  displayName: string;
  vehicleMake: string;
  vehicleModel: string;
  fuelEfficiencyL100km: string;
  fuelType: 'gas' | 'electric' | 'hybrid';
  notificationsEnabled: boolean;
  notifPrefs: NotifPrefs;
  currency: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export default function ProfileScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState<ProfileForm>({
    displayName: '',
    vehicleMake: '',
    vehicleModel: '',
    fuelEfficiencyL100km: '',
    fuelType: 'gas',
    notificationsEnabled: true,
    notifPrefs: { newExpense: true, paymentRequested: true, paymentReceived: true, reminder: true },
    currency: 'CAD',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currencyModal, setCurrencyModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid)
      .then((profile) => {
        if (profile) {
          setForm({
            displayName: profile.displayName ?? user.displayName ?? '',
            vehicleMake: profile.vehicle?.make ?? '',
            vehicleModel: profile.vehicle?.model ?? '',
            fuelEfficiencyL100km: profile.vehicle?.fuelEfficiencyL100km
              ? String(profile.vehicle.fuelEfficiencyL100km)
              : '',
            fuelType: profile.vehicle?.fuelType ?? 'gas',
            notificationsEnabled: profile.notificationsEnabled ?? true,
            notifPrefs: {
              newExpense: profile.notificationPreferences?.newExpense ?? true,
              paymentRequested: profile.notificationPreferences?.paymentRequested ?? true,
              paymentReceived: profile.notificationPreferences?.paymentReceived ?? true,
              reminder: profile.notificationPreferences?.reminder ?? true,
            },
            currency: profile.currency ?? 'CAD',
          });
        } else {
          setForm((f) => ({ ...f, displayName: user.displayName ?? '' }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!form.displayName.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    setSaving(true);
    try {
      const hasVehicle = form.vehicleMake.trim() || form.vehicleModel.trim();
      await upsertUserProfile(user.uid, {
        uid: user.uid,
        email: user.email ?? '',
        displayName: form.displayName.trim(),
        notificationsEnabled: form.notificationsEnabled,
        notificationPreferences: form.notifPrefs,
        currency: form.currency,
        ...(hasVehicle && {
          vehicle: {
            make: form.vehicleMake.trim(),
            model: form.vehicleModel.trim(),
            year: 0,
            fuelType: form.fuelType,
            mpg: 0,
            fuelEfficiencyL100km: parseFloat(form.fuelEfficiencyL100km) || 0,
          },
        }),
      });
      navigation.goBack();
    } catch {
      Alert.alert('Save failed', 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
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

  const initials = getInitials(form.displayName || user?.displayName || '?');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{initials}</Text>
            </View>
            <Text style={styles.email}>{user?.email ?? ''}</Text>
          </View>

          <Text style={styles.sectionLabel}>PERSONAL</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.displayName}
                onChangeText={(v) => setForm((f) => ({ ...f, displayName: v }))}
                placeholder="Your name"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>VEHICLE</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Make</Text>
              <TextInput
                style={styles.input}
                value={form.vehicleMake}
                onChangeText={(v) => setForm((f) => ({ ...f, vehicleMake: v }))}
                placeholder="e.g. Toyota"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.field, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>Model</Text>
              <TextInput
                style={styles.input}
                value={form.vehicleModel}
                onChangeText={(v) => setForm((f) => ({ ...f, vehicleModel: v }))}
                placeholder="e.g. Camry"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.field, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>Fuel efficiency</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, textAlign: 'right' }]}
                  value={form.fuelEfficiencyL100km}
                  onChangeText={(v) => setForm((f) => ({ ...f, fuelEfficiencyL100km: v }))}
                  placeholder="8.5"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.unit}>L/100km</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Notifications</Text>
              <Switch
                value={form.notificationsEnabled}
                onValueChange={(v) => setForm((f) => ({ ...f, notificationsEnabled: v }))}
                trackColor={{ false: Colors.border, true: Colors.primaryMuted }}
                thumbColor={form.notificationsEnabled ? Colors.primary : Colors.textSecondary}
              />
            </View>
            {form.notificationsEnabled && (
              <>
                {(
                  [
                    { key: 'newExpense', label: 'New expenses' },
                    { key: 'paymentRequested', label: 'Payment requests' },
                    { key: 'paymentReceived', label: 'Payment received' },
                    { key: 'reminder', label: 'Payment reminders' },
                  ] as { key: keyof NotifPrefs; label: string }[]
                ).map(({ key, label }) => (
                  <View key={key} style={[styles.field, styles.fieldBorder, styles.subField]}>
                    <Text style={styles.subFieldLabel}>{label}</Text>
                    <Switch
                      value={form.notifPrefs[key]}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          notifPrefs: { ...f.notifPrefs, [key]: v },
                        }))
                      }
                      trackColor={{ false: Colors.border, true: Colors.primaryMuted }}
                      thumbColor={form.notifPrefs[key] ? Colors.primary : Colors.textSecondary}
                    />
                  </View>
                ))}
              </>
            )}
            <TouchableOpacity
              style={[styles.field, styles.fieldBorder]}
              onPress={() => setCurrencyModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.fieldLabel}>Currency</Text>
              <View style={styles.valueRow}>
                <Text style={styles.value}>{form.currency}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textInverse} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={currencyModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setCurrencyModal(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Currency</Text>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={styles.currencyRow}
                onPress={() => {
                  setForm((f) => ({ ...f, currency: c }));
                  setCurrencyModal(false);
                }}
              >
                <Text style={styles.currencyLabel}>{c}</Text>
                {form.currency === c && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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

  scroll: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },

  avatarRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySubtle,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.primary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
  },
  email: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },

  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 52,
  },
  fieldBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  fieldLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  input: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    textAlign: 'right',
    flex: 1,
    paddingVertical: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  unit: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginLeft: Spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
  },

  subField: {
    paddingLeft: Spacing.base + Spacing.md,
  },
  subFieldLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    flex: 1,
  },

  saveBtn: {
    marginTop: Spacing.xxl,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    ...Shadow.green,
  },
  saveBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },

  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.md,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  currencyLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
  },
});
