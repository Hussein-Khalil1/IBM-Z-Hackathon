/**
 * Maps Firebase Auth error codes to human-readable messages.
 * Never expose raw Firebase codes to the user.
 */
const AUTH_ERROR_MAP: Record<string, string> = {
  // Sign-in / sign-up
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  // Network
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  // Google OAuth
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  // Password reset
  'auth/expired-action-code': 'This reset link has expired. Please request a new one.',
  'auth/invalid-action-code': 'This reset link is invalid. Please request a new one.',
};

export function friendlyAuthError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return AUTH_ERROR_MAP[code] ?? 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}
