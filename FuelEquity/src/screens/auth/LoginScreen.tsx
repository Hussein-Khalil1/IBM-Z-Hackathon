import React, { useState, useEffect } from 'react';
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
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../../theme';
import { AuthInput } from '../../components/ui/AuthInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { signInWithEmail, signInWithGoogleCredential } from '../../services/auth';
import { friendlyAuthError } from '../../utils/authErrors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CONFIGURED =
  !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID &&
  !!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        onCredential(idToken).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
    if (response?.type === 'error' || response?.type === 'cancel') {
      setLoading(false);
    }
  }, [response]);

  return (
    <PrimaryButton
      label="Continue with Google"
      onPress={() => { setLoading(true); promptAsync(); }}
      loading={loading}
      disabled={!request}
      variant="outline"
    />
  );
}

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleGoogleCredential(idToken: string) {
    try {
      await signInWithGoogleCredential(idToken);
    } catch (err) {
      Alert.alert('Sign-in failed', friendlyAuthError(err));
    }
  }

  function validate() {
    let valid = true;
    if (!email.trim()) {
      setEmailError('Email is required.');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else {
      setEmailError('');
    }
    if (!password) {
      setPasswordError('Password is required.');
      valid = false;
    } else {
      setPasswordError('');
    }
    return valid;
  }

  async function handleEmailLogin() {
    if (!validate()) return;
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      Alert.alert('Sign-in failed', friendlyAuthError(err));
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
          <View style={styles.header}>
            <Text style={styles.wordmark}>FuelEquity</Text>
            <Text style={styles.tagline}>Community-powered trip economics</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Welcome back</Text>

            <AuthInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholder="you@example.com"
              error={emailError}
            />
            <AuthInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              isPassword
              error={passwordError}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotRow}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <PrimaryButton
              label="Sign in"
              onPress={handleEmailLogin}
              loading={loading}
              style={styles.submitBtn}
            />

            {GOOGLE_CONFIGURED && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.divider} />
                </View>
                <GoogleSignInButton onCredential={handleGoogleCredential} />
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={styles.footerLink}>Sign up</Text>
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
  header: { alignItems: 'center', paddingTop: Spacing.xxxl, paddingBottom: Spacing.xxl },
  wordmark: {
    color: Colors.primary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
  },
  tagline: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
  form: { flex: 1 },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xl,
  },
  forgotRow: { alignItems: 'flex-end', marginBottom: Spacing.xl, marginTop: -Spacing.sm },
  forgotText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  submitBtn: { marginBottom: Spacing.xl },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  divider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: FontSize.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: Spacing.xxl,
  },
  footerText: { color: Colors.textMuted, fontSize: FontSize.sm },
  footerLink: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
