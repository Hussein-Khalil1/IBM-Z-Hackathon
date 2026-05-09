import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing } from '../../theme';
import { AuthInput } from '../../components/ui/AuthInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { resetPassword } from '../../services/auth';
import { friendlyAuthError } from '../../utils/authErrors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    if (!email.trim()) {
      setEmailError('Email is required.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      Alert.alert('Reset failed', friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {sent ? (
            <View style={styles.successCard}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Check your inbox</Text>
              <Text style={styles.successBody}>
                We've sent a password reset link to{' '}
                <Text style={styles.emailHighlight}>{email}</Text>.{'\n\n'}
                Didn't receive it? Check your spam folder or try again.
              </Text>
              <PrimaryButton
                label="Back to sign in"
                onPress={() => navigation.navigate('Login')}
                style={{ marginTop: Spacing.xl }}
              />
            </View>
          ) : (
            <>
              <Text style={styles.title}>Reset password</Text>
              <Text style={styles.subtitle}>
                Enter your email and we'll send you a link to reset your password.
              </Text>

              <AuthInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholder="you@example.com"
                error={emailError}
              />

              <PrimaryButton
                label="Send reset link"
                onPress={handleReset}
                loading={loading}
                style={styles.submitBtn}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: Spacing.xl },
  back: { paddingTop: Spacing.lg, marginBottom: Spacing.xl },
  backText: { color: Colors.primary, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  submitBtn: { marginTop: Spacing.sm },
  successCard: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  successIcon: { fontSize: 48, color: Colors.primary, marginBottom: Spacing.lg },
  successTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  successBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  emailHighlight: { color: Colors.primary, fontWeight: FontWeight.semibold },
});
