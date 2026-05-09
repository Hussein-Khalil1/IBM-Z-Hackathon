import { create } from 'zustand';
import { User } from 'firebase/auth';
import { subscribeToAuthState } from '../services/auth';

interface AuthState {
  user: User | null;
  /** true while onAuthStateChanged has not yet fired for the first time */
  loading: boolean;
  _setUser: (user: User | null) => void;
  _setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  _setUser: (user) => set({ user }),
  _setLoading: (loading) => set({ loading }),
}));

/**
 * Start the Firebase auth listener.
 * Call once at the app root — persists for the app's lifetime.
 * Firebase Auth on React Native automatically persists the session
 * to AsyncStorage, so the user stays logged in across restarts.
 */
export function initAuthListener() {
  const unsubscribe = subscribeToAuthState((user) => {
    useAuthStore.setState({ user, loading: false });
  });
  return unsubscribe;
}
