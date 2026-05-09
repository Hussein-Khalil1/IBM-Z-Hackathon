import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing } from '../../theme';
import { AuthInput } from '../../components/ui/AuthInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { signUpWithEmail } from '../../services/auth';
import { friendlyAuthError } from '../../utils/authErrors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required.';
    if (!email.trim()) {
      e.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      e.email = 'Please enter a valid email address.';
    }
    if (!password) {
      e.password = 'Password is required.';
    } else if (password.length < 6) {
      e.password = 'Password must be at least 6 characters.';
    }
    if (!confirm) {
      e.confirm = 'Please confirm your password.';
    } else if (confirm !== password) {
      e.confirm = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSignUp() {
    if (!validate()) return;
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password, name.trim());
      // onAuthStateChanged drives navigation — no manual navigate needed
    } catch (err) {
      Alert.alert('Sign-up failed', friendlyAuthError(err));
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join thousands of Ontario drivers saving on every trip.</Text>

          <AuthInput
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Jane Smith"
            error={errors.name}
          />
          <AuthInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="you@example.com"
            error={errors.email}
          />
          <AuthInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            isPassword
            error={errors.password}
          />
          <AuthInput
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            isPassword
            error={errors.confirm}
          />

          <PrimaryButton
            label="Create account"
            onPress={handleSignUp}
            loading={loading}
            style={styles.submitBtn}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxxl },
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
  submitBtn: { marginTop: Spacing.sm, marginBottom: Spacing.xl },
  footer: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: Colors.textMuted, fontSize: FontSize.sm },
  footerLink: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
